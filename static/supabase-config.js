// Lee la URL y la clave PÚBLICA (anon) de Supabase desde las etiquetas <meta> que pone el servidor.
// Los valores salen de las variables de entorno de Render (SUPABASE_URL y SUPABASE_ANON_KEY),
// así no quedan escritos en el código. La clave anon es pública por diseño: la protección real
// de los datos está en las políticas RLS de Supabase. La service_role NUNCA llega al navegador.
function leer(nombre) {
  const el = document.querySelector('meta[name="' + nombre + '"]');
  return (el && el.content ? el.content : "").trim();
}

export const SUPABASE_URL = leer("supabase-url");
export const SUPABASE_ANON_KEY = leer("supabase-anon-key");

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Falta la configuración pública de Supabase (variables SUPABASE_URL y SUPABASE_ANON_KEY en el servidor).");
}
