import { Injectable } from '@angular/core';
import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from '../config/supabase.config';

@Injectable({
    providedIn: 'root'
})
export class SupabaseService {
    private readonly claveRecordatorio = 'cinefilia-recordarme';

    private readonly almacenamiento = {
        getItem: (clave: string): string | null => {
            return sessionStorage.getItem(clave) ?? localStorage.getItem(clave);
        },

        setItem: (clave: string, valor: string): void => {
            const preferencia =
                sessionStorage.getItem(this.claveRecordatorio) ??
                localStorage.getItem(this.claveRecordatorio);

            if (preferencia === 'true') {
                localStorage.setItem(clave, valor);
                sessionStorage.removeItem(clave);
            } else {
                sessionStorage.setItem(clave, valor);
                localStorage.removeItem(clave);
            }
        },

        removeItem: (clave: string): void => {
            sessionStorage.removeItem(clave);
            localStorage.removeItem(clave);
        }
    };

    readonly cliente = createClient(
        supabaseConfig.url,
        supabaseConfig.publishableKey,
        {
            auth: {
                persistSession: true,
                storage: this.almacenamiento
            }
        }
    );

    configurarRecordatorio(recordarme: boolean): void {
        sessionStorage.setItem(
            this.claveRecordatorio,
            String(recordarme)
        );

        if (recordarme) {
            localStorage.setItem(this.claveRecordatorio, 'true');
        } else {
            localStorage.removeItem(this.claveRecordatorio);
        }
    }
}