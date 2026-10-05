import { Routes } from '@angular/router';
import { permitirRoles } from './base/guard/rol.guard';
import { Inicio } from './pages/inicio/inicio';
import { Cartelera } from './pages/cartelera/cartelera';
import { Registro } from './pages/registro/registro';

export const routes: Routes = [
    {
        path: '',
        component: Inicio,
        pathMatch: 'full'
    },
    {
        path: 'cartelera',
        component: Cartelera
    },
    {
        path: 'candy',
        loadComponent: () =>
            import('./pages/candy/candy').then(
                (componente) => componente.Candy
            )
    },
    {
        path: 'registro',
        component: Registro
    },
    {
        path: 'admin',
        loadComponent: () =>
            import('./pages/admin/admin').then(
                (componente) => componente.Admin
            ),
        canActivate: [permitirRoles('admin')]
    },
    {
        path: 'empleado',
        loadComponent: () =>
            import('./pages/empleado/empleado').then(
                (componente) => componente.Empleado
            ),
        canActivate: [permitirRoles('empleado', 'admin')]
    },
    {
        path: 'butacas/:id',
        loadComponent: () =>
            import('./pages/butacas/butacas').then(
                (componente) => componente.Butacas
            )
    },
    {
        path: 'compra/:id/candy',
        loadComponent: () =>
            import('./pages/candy-compra/candy-compra').then(
                (componente) => componente.CandyCompra
            )
    },
    {
        path: 'compra/:id/confirmar',
        loadComponent: () =>
            import('./pages/confirmar-compra/confirmar-compra').then(
                (componente) => componente.ConfirmarCompra
            )
    },
    {
        path: 'mis-compras',
        loadComponent: () =>
            import('./pages/mis-compras/mis-compras').then(
                (componente) => componente.MisCompras
            )
    },
    {
        path: '**',
        redirectTo: ''
    }
];