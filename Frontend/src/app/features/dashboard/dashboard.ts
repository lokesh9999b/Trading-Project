import { Component, OnInit, ViewChild, NgZone, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { WebsocketService } from '../../core/services/websocket';
import { Trade } from '../../core/models/trade.interface';
import { TradingChartComponent } from './components/trading-chart/trading-chart';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, TradingChartComponent, FormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
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

  maxVolume = 1; // Avoid divide by zero

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
      const strTrade = { ...trade, price: price, volume: volume };
      this.recentTrades = [trade, ...this.recentTrades].slice(0, 15);

      // Calculate Max Volume for Depth Bars
      this.maxVolume = Math.max(...this.recentTrades.map(t => Number(t.volume) || 0));

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

  chartTypes: string[] = ['Candlestick', 'Line', 'Area', 'Bar'];
  currentChartType: string = 'Candlestick';
  viewMode: 'Live' | 'Historical' = 'Live';
  isLoadingHistory = false;
  historyError = '';

  onChartTypeChange(type: any) {
    this.currentChartType = type;
    if (this.chartComponent) {
      this.chartComponent.setChartType(type);
    }
  }

  async fetchHistory() {
    if (!this.startDate || !this.endDate) return;

    this.isLoadingHistory = true;
    this.historyError = '';
    this.viewMode = 'Historical'; // Switch mode immediately

    if (this.chartComponent) {
      this.chartComponent.setMode('Historical');
    }

    try {
      const response = await fetch(`http://localhost:3000/api/history?start=${this.startDate}&end=${this.endDate}`);
      const data = await response.json();

      if (data.error) throw new Error(data.error);

      // Transform data
      const chartData = data.map((t: any) => ({
        time: new Date(t.timestamp).getTime() / 1000,
        open: Number(t.price),
        high: Number(t.price),
        low: Number(t.price),
        close: Number(t.price)
      }));

      // Dedupe and sort
      const uniqueData = new Map();
      chartData.forEach((item: any) => uniqueData.set(item.time, item));
      const sortedData = Array.from(uniqueData.values()).sort((a: any, b: any) => a.time - b.time);

      if (this.chartComponent) {
        this.chartComponent.setHistoricalData(sortedData);
      }

    } catch (err: any) {
      this.historyError = "Failed to load history: " + err.message;
      console.error(err);
    } finally {
      this.isLoadingHistory = false;
    }
  }

  setQuickRange(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);

    this.endDate = end.toISOString().split('T')[0];
    this.startDate = start.toISOString().split('T')[0];

    this.fetchHistory();
  }

  backToLive() {
    this.viewMode = 'Live';
    this.startDate = '';
    this.endDate = '';
    if (this.chartComponent) {
      this.chartComponent.setMode('Live');
    }
    // Reset dates to default last 7 days without triggering fetch? 
    // Or just leave them empty/default? 
    // Let's reset to default range but not fetch.
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 7);
    this.endDate = end.toISOString().split('T')[0];
    this.startDate = start.toISOString().split('T')[0];
  }
}