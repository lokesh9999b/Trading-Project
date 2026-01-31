import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { WebsocketService } from '../../core/services/websocket';
import { Trade } from '../../core/models/trade.interface';
import { CommonModule } from '@angular/common';
// Import your chart component here
import { TradingChartComponent } from './components/trading-chart/trading-chart'; 

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, TradingChartComponent], // Add it here
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardComponent implements OnInit {
  trades$: Observable<Trade> | undefined;
  constructor(private wsService: WebsocketService) { }

  ngOnInit(): void {
    this.trades$ = this.wsService.getTrade(); //
  }
}