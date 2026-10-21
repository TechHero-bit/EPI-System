import { inject } from "@angular/core";
import { Router, type CanActivateFn } from "@angular/router";
import { PortalStore } from "../services/portal.service";

export const access: CanActivateFn = async (route) => {
  const store = inject(PortalStore),
    router = inject(Router);
  try {
    await store.init();
  } catch (error) {
    store.failure.set(
      error instanceof Error ? error.message : "Conexão indisponível.",
    );
    return router.parseUrl("/login");
  }
  if (!store.user()) return router.parseUrl("/login");
  const roles = route.data["roles"] as string[] | undefined;
  if (roles && !roles.includes(store.role)) {
    store.failure.set("Seu perfil não tem acesso a esta página.");
    return router.parseUrl("/dashboard");
  }
  return true;
};
