import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Barnav } from './shared/components/barnav/barnav';

@Component({
  selector: 'app-root',
  imports: [Barnav, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {}