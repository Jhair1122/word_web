// Mantiene una cookie "sb_access_token" sincronizada con la sesión de Supabase.
// Esto permite que el backend (Flask) valide la sesión en peticiones normales
// de navegación (GET /admin), donde no se puede mandar un header Authorization.
export function setupAuthCookieSync(supabase) {
  function setCookie(token) {
    if (token) {
      // SameSite=Lax + Secure: solo se envía en peticiones propias del sitio, por HTTPS.
      document.cookie = `sb_access_token=${token}; path=/; SameSite=Lax; Secure`;
    } else {
      document.cookie = "sb_access_token=; path=/; Max-Age=0; SameSite=Lax; Secure";
    }
  }

  // Sincroniza en cuanto se carga la página (por si ya había sesión).
  supabase.auth.getSession().then(({ data: { session } }) => {
    setCookie(session ? session.access_token : null);
  });

  // Sincroniza en cada cambio: login, logout, refresco automático de token.
  supabase.auth.onAuthStateChange((_event, session) => {
    setCookie(session ? session.access_token : null);
  });
}
