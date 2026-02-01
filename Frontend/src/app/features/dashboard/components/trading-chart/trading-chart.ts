import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, NgZone } from '@angular/core';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';
import { WebsocketService } from '../../../../core/services/websocket';
import { Trade } from '../../../../core/models/trade.interface';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-trading-chart',
  standalone: true,
  template: `<div #chartContainer class="chart-container"></div>`,
  styles: [`.chart-container { height: 500px; width: 100%; border-radius: 8px; overflow: hidden; }`]
})
export class TradingChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chartContainer') chartContainer!: ElementRef;
  private chart: any;
  private candleSeries: any;
  private tradeSub!: Subscription;
  private currentCandle: any = null;
  private selectedInterval = 60; 

  constructor(private wsService: WebsocketService, private ngZone: NgZone) { }

  ngAfterViewInit() {
    this.chart = createChart(this.chartContainer.nativeElement, {
      width: this.chartContainer.nativeElement.clientWidth,
      height: 500,
      layout: { 
        background: { type: ColorType.Solid, color: '#0d1117' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#1f2937' },
        horzLines: { color: '#1f2937' },
      },
      localization: {
        locale: 'en-IN',
        timeFormatter: (timestamp: number) => {
          return new Date(timestamp * 1000).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
          });
        }
      },
      timeScale: { timeVisible: true, borderColor: '#30363d' }
    });

    // FIXED: Modern API (v4/v5)
    this.candleSeries = this.chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a', downColor: '#ef5350',
      wickUpColor: '#26a69a', wickDownColor: '#ef5350',
    });

    this.tradeSub = this.wsService.getTrade().subscribe((trade) => {
      if (!trade) return;
      // Force chart update within Angular's Zone
      this.ngZone.run(() => {
        this.updateCandle(trade);
      });
    });

    window.addEventListener('resize', () => {
        this.chart.applyOptions({ width: this.chartContainer.nativeElement.clientWidth });
    });
  }

  public setTimeframe(minutes: number) {
    this.selectedInterval = minutes * 60;
    this.candleSeries.setData([]); 
    this.currentCandle = null;
  }

  private updateCandle(trade: Trade) {
    const price = Number(trade.price);
    const timestamp = Math.floor(new Date(trade.time).getTime() / 1000);
    if (isNaN(price)) return;

    const candleTime = Math.floor(timestamp / this.selectedInterval) * this.selectedInterval;

    if (this.currentCandle && candleTime < this.currentCandle.time) return;

    if (!this.currentCandle || candleTime > this.currentCandle.time) {
      this.currentCandle = {
        time: candleTime as any,
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