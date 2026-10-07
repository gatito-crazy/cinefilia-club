import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { Barnav } from './shared/components/barnav/barnav';

@Component({
    selector: 'app-barnav',
    template: '<nav aria-label="Principal">Cinefilia Club</nav>',
})
class BarnavPrueba {}

describe('App', () => {
    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [App],
            providers: [provideRouter([])],
        })
            .overrideComponent(App, {
                remove: { imports: [Barnav] },
                add: { imports: [BarnavPrueba] },
            })
            .compileComponents();
    });

    it('mantiene la navegación fuera del contenido de las rutas', () => {
        const fixture = TestBed.createComponent(App);
        fixture.detectChanges();
        const pagina = fixture.nativeElement as HTMLElement;
        expect(pagina.querySelector('app-barnav nav')).toBeTruthy();
        expect(pagina.querySelector('main router-outlet')).toBeTruthy();
        expect(pagina.querySelector('main app-barnav')).toBeNull();
    });
});
