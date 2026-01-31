import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { createChart, IChartApi, ISeriesApi, ColorType } from 'lightweight-charts';
import { WebsocketService } from '../../../../core/services/websocket';
import { Subscription } from 'rxjs';
@Component({
  selector: 'app-trading-chart',
  imports: [],
  standalone: true,
  template: `<div #chartContainer class="chart-container"></div>`,
  styles: [`.chart-container { height: 500px; width: 100%; background-color: #0d1117; 
      border: 1px solid #30363d;
      border-radius: 8px; }`]
})
export class TradingChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chartContainer') chartContainer!: ElementRef;
  private chart!: IChartApi;
  private candleSeries!: ISeriesApi<'Candlestick'>;
  private tradeSub!: Subscription;

  constructor(private wsService: WebsocketService) { }

  ngAfterViewInit() {
    // 1. Initialize the Chart
    this.chart = createChart(this.chartContainer.nativeElement, {
      layout: { background: { type: ColorType.Solid, color: '#0d1117' }, textColor: '#d1d4dc' },
      grid: { vertLines: { color: '#1f2937' }, horzLines: { color: '#1f2937' } },
      timeScale: { timeVisible: true, secondsVisible: true }
    });

    this.candleSeries = (this.chart as any).addCandlestickSeries({
  upColor: '#26a69a', 
  downColor: '#ef5350',
  borderVisible: false, 
  wickUpColor: '#26a69a', 
  wickDownColor: '#ef5350',
});

    // 2. Listen to Live Trades
    this.tradeSub = this.wsService.getTrade().subscribe(trade => {
      this.updateCandle(trade);
    });
  }

  private currentCandle: any = null;

  private updateCandle(trade: any) {
    const timestamp = Math.floor(new Date(trade.time).getTime() / 1000);
    const price = trade.price;

    // Logic to group trades into 1-minute candles
    if (!this.currentCandle || timestamp >= this.currentCandle.time + 60) {
      this.currentCandle = {
        time: Math.floor(timestamp / 60) * 60,
        open: price, high: price, low: price, close: price
      };
    } else {
      this.currentCandle.high = Math.max(this.currentCandle.high, price);
      this.currentCandle.low = Math.min(this.currentCandle.low, price);
      this.currentCandle.close = price;
    }

    this.candleSeries.update(this.currentCandle);
  }

  ngOnDestroy() {
    if (this.tradeSub) this.tradeSub.unsubscribe();
    if (this.chart) this.chart.remove();
  }
}
