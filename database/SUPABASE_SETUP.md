# Configurar acceso de socios

El panel no se habilita hasta que Supabase Auth valide una sesión y `partner_profiles` confirme el rol `owner`. Las políticas RLS protegen las tablas incluso si alguien intenta llamar directamente a la API.

## 1. Crear el proyecto

Crea un proyecto de Supabase y conserva la URL del proyecto y la clave publicable (anon). La clave publicable puede estar en el cliente; nunca pongas una `service_role` key en la app ni en variables `EXPO_PUBLIC_*`.

## 2. Inicializar la base de datos

En Supabase Dashboard > SQL Editor, ejecuta en este orden:

1. `database/schema.sql`
2. `database/supabase-security.sql`
3. `database/empanada-costing.sql`

Los tres scripts se pueden volver a ejecutar, siempre en este orden. Si se repite el esquema base, vuelve a correr después el script de seguridad y luego el de costos para dejar wrappers, permisos y parametrización en el estado final esperado.

Si la app muestra `Could not find the table 'public.recipe_costs' in the schema cache`, ejecuta `database/empanada-costing.sql` en el SQL Editor del mismo proyecto de Supabase configurado en Vercel. El script crea/actualiza la vista y envía `NOTIFY pgrst, 'reload schema'` al confirmar la transacción. Puedes verificar la vista desde SQL Editor con:

```sql
SELECT to_regclass('public.recipe_costs');
SELECT name, current_stock, average_unit_cost FROM public.stock_items WHERE kind = 'ingredient' ORDER BY name;
```

La segunda migración habilita RLS, restringe el acceso a socios y reemplaza las funciones de escritura por wrappers que verifican el rol antes de ejecutarse. La tercera carga el stock inicial una sola vez, parametriza la receta y el precio, habilita mermas/ajustes y genera automáticamente producto faltante desde la receta al confirmar una venta.

La receta configurada produce una docena: 0,333333 kg de harina, 0,083333 kg de grasa, 0,2 kg de carne, 1 huevo, 0,3 kg de cebolla y 0,06 kg de pimiento. El catálogo usa un precio uniforme de `$1.700` por unidad y `$20.000` por docena completa para todos los sabores. La migración persiste ambos valores en productos; con los costos iniciales, el costo de materia prima esperado es aproximadamente `$4.835` por docena y la ganancia bruta `$15.165` (margen aproximado `75,83%`), antes de mano de obra, energía, envases, impuestos y comisiones.

## 3. Crear las cuentas de los socios

En Authentication > Users, crea una cuenta individual para cada socio y exige contraseña segura. Deshabilita el registro público si no quieres que clientes creen cuentas de acceso administrativo.

Copia los UUID de ambos usuarios y ejecuta, reemplazando los valores:

```sql
INSERT INTO public.partner_profiles (user_id, partner_id, role)
SELECT 'UUID_AUTH_SOCIO_1'::uuid, id, 'owner'
FROM public.partners WHERE name = 'Socio 1';

INSERT INTO public.partner_profiles (user_id, partner_id, role)
SELECT 'UUID_AUTH_SOCIO_2'::uuid, id, 'owner'
FROM public.partners WHERE name = 'Socio 2';
```

Cada usuario puede acceder solo cuando su UUID esté asociado a un socio. No incluyas contraseñas en SQL, el repo ni el chat.

## 4. Configurar la app local

Copia `.env.example` a `.env`, completa la URL y clave publicable desde Project Settings > API, y reinicia Expo para que lea las variables:

```powershell
Copy-Item .env.example .env
npm run web -- --port 19010
```

En `http://localhost:19010`, pulsa **Socios** e inicia sesión. La opción Administración solo se muestra a una sesión con rol `owner`; cerrar sesión la vuelve a ocultar. El panel permite registrar ingresos con costo unitario, mermas, ajustes con delta positivo/negativo, cambiar el precio minorista y producir docenas. Los cambios se guardan en Supabase y se registran en `inventory_movements`.

## Operaciones de clientes

Las tablas del negocio están cerradas a `anon` por diseño. La creación de pedidos desde el flujo público debe pasar por un backend/Edge Function con validación; no expongas la clave `service_role` al cliente. El panel de inventario y costos consulta Supabase; el checkout público de `BoxBuilder` sigue siendo demostrativo y todavía no crea pedidos en la base. La confirmación automática de producción/venta queda disponible en la función protegida de Supabase, pero para usarla desde el checkout habrá que implementar ese backend y asociar recetas a cada sabor/producto vendido.
