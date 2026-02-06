import { Component, OnInit, ViewChild, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { WebsocketService } from '../../core/services/websocket';
import { Trade } from '../../core/models/trade.interface';
import { TradingChartComponent } from './components/trading-chart/trading-chart';
import { HistoricalChartComponent } from './components/historical-chart/historical-chart';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, TradingChartComponent, HistoricalChartComponent, FormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardComponent implements OnInit {
  public readonly Infinity = Infinity;
  @ViewChild(TradingChartComponent) chartComponent!: TradingChartComponent;

  latestTrade: Trade | null = null;
  recentTrades: Trade[] = [];
  high24h = 0;
  low24h = Infinity;
  volume24h = 0;
  activeTimeframe = '1m';
  isConnected$!: Observable<boolean>;

  startDate: string = '';
  endDate: string = '';

  constructor(private wsService: WebsocketService, private ngZone: NgZone, private cdr: ChangeDetectorRef) { }

  ngOnInit(): void {
    this.isConnected$ = this.wsService.getIsConnected();

    // Set default Last 7 Days
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 7);
    this.endDate = end.toISOString().split('T')[0];
    this.startDate = start.toISOString().split('T')[0];

    this.wsService.getTrade().subscribe((trade) => {
      if (!trade) return;

      this.latestTrade = trade;

      // Strict Number Parsing
      const price = Number(trade.price);
      const volume = Number(trade.volume);

      if (!isNaN(price)) {
        if (price > this.high24h) this.high24h = price;
        if (price < this.low24h || this.low24h === Infinity) this.low24h = price;
      }

      if (!isNaN(volume)) {
        this.volume24h += volume;
      }

      // Maintain recent trades list
      const strTrade = { ...trade, price: price, volume: volume }; // ensure numbers in list if needed
      this.recentTrades = [trade, ...this.recentTrades].slice(0, 15);

      // Manually trigger change detection to ensure View updates immediately
      this.cdr.detectChanges();
    });
  }

  onTimeframeChange(tf: string, minutes: number) {
    this.activeTimeframe = tf;
    if (this.chartComponent) {
      this.chartComponent.setTimeframe(minutes);
    }
  }
}