-- The current personal-PIN login flow resolves a single account by the
-- supplied name through get_personal_pin_login_status(). The older
-- installation-wide user-list RPC is not used by the current frontend and
-- exposes names and person identifiers to unauthenticated callers.
-- Remove its public API access; retain the function only for controlled
-- internal maintenance if ever needed.

REVOKE ALL ON FUNCTION public.get_installation_login_users(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_installation_login_users(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_installation_login_users(text) FROM authenticated;
