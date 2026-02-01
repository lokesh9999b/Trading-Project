import { Component, OnInit, ViewChild, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WebsocketService } from '../../core/services/websocket';
import { Trade } from '../../core/models/trade.interface';
import { TradingChartComponent } from './components/trading-chart/trading-chart';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, TradingChartComponent],
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

  constructor(private wsService: WebsocketService, private ngZone: NgZone) { }

  ngOnInit(): void {
    this.wsService.getTrade().subscribe((trade) => {
      if (!trade) return;
      this.ngZone.run(() => {
        this.latestTrade = trade;
          const price = Number(trade.price);
          if (price > this.high24h) this.high24h = price;
          if (price < this.low24h || this.low24h === 0) this.low24h = price;
          this.volume24h += Number(trade.volume) || 0;

          this.recentTrades.unshift(trade);
          if (this.recentTrades.length > 15) this.recentTrades.pop();
      });
    });
  }

  onTimeframeChange(tf: string, minutes: number) {
    this.activeTimeframe = tf;
    if (this.chartComponent) {
      this.chartComponent.setTimeframe(minutes);
    }
  }
}