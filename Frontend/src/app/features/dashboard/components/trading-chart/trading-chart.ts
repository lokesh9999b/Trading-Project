import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { createChart, IChartApi, ISeriesApi, ColorType } from 'lightweight-charts';
import { WebsocketService } from '../../../../core/services/websocket';
import { Trade } from '../../../../core/models/trade.interface';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-trading-chart',
  standalone: true,
  template: `<div #chartContainer class="chart-container"></div>`,
  styles: [`.chart-container { height: 500px; width: 100%; background-color: #0d1117; 
      border: 1px solid #30363d; border-radius: 8px; }`]
})
export class TradingChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chartContainer') chartContainer!: ElementRef;
  private chart: any; // Using any here to bypass the strict interface check
  private candleSeries: any;
  private tradeSub!: Subscription;
  private currentCandle: any = null;

  constructor(private wsService: WebsocketService) { }

  ngAfterViewInit() {
    // 1. Initialize the Chart
    this.chart = createChart(this.chartContainer.nativeElement, {
      width: this.chartContainer.nativeElement.clientWidth,
      height: 500,
      layout: { background: { type: ColorType.Solid, color: '#0d1117' }, textColor: '#d1d4dc' },
      grid: { vertLines: { color: '#1f2937' }, horzLines: { color: '#1f2937' } },
      timeScale: { timeVisible: true, secondsVisible: true }
    });

    // 2. THE FIX: Try both possible methods for compatibility
    if (this.chart.addCandlestickSeries) {
        this.candleSeries = this.chart.addCandlestickSeries({
            upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
            wickUpColor: '#26a69a', wickDownColor: '#ef5350',
        });
    } else {
        // Fallback for different library versions
        this.candleSeries = this.chart.addSeries('Candlestick', {
            upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
            wickUpColor: '#26a69a', wickDownColor: '#ef5350',
        });
    }

    // Handle Resize
    window.addEventListener('resize', () => {
      this.chart.applyOptions({ width: this.chartContainer.nativeElement.clientWidth });
    });

    // 3. Listen to trades
    this.tradeSub = this.wsService.getTrade().subscribe((trade: Trade) => {
      this.updateCandle(trade);
    });
  }

  private updateCandle(trade: any) {
    const price = parseFloat(trade.price);
    const timestamp = Math.floor(new Date(trade.time).getTime() / 1000);
    if (isNaN(price)) return;

    const candleTime = Math.floor(timestamp / 60) * 60;

    if (!this.currentCandle || candleTime > this.currentCandle.time) {
      this.currentCandle = {
        time: candleTime,
        open: price, high: price, low: price, close: price
      };
    } else {
      this.currentCandle.high = Math.max(this.currentCandle.high, price);
      this.currentCandle.low = Math.min(this.currentCandle.low, price);
      this.currentCandle.close = price;
    }

    if (this.candleSeries) {
      this.candleSeries.update(this.currentCandle);
    }
  }

  ngOnDestroy() {
    if (this.tradeSub) this.tradeSub.unsubscribe();
    if (this.chart) this.chart.remove();
  }
}