import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, RolUsuario } from '../service/auth.service';

export function permitirRoles(...roles: RolUsuario[]): CanActivateFn {
    return async () => {
        const auth = inject(AuthService);
        const router = inject(Router);

        try {
            const rol = await auth.obtenerRol();

            if (rol !== null && roles.includes(rol)) {
                return true;
            }

            return router.createUrlTree(['/']);
        } catch (error) {
            console.error('No se pudo comprobar el acceso:', error);

            return router.createUrlTree(['/']);
        }
    };
}