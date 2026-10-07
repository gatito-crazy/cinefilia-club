import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));

if ('serviceWorker' in navigator && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    window.addEventListener('load', () => {
        void navigator.serviceWorker.register('/cine-sw.js').catch(error => {
            console.error('No se pudo registrar la PWA:', error);
        });
    });
}
