import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router'; // 👈 1. Import this

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet], // 👈 2. Add it to this array
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class AppComponent {
  title = 'Frontend';
}