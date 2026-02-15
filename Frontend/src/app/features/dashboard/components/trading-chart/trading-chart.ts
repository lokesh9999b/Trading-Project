import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, NgZone } from '@angular/core';
import { createChart, ColorType, CandlestickSeries, LineSeries, AreaSeries, BarSeries, ISeriesApi, SeriesType } from 'lightweight-charts';
import { WebsocketService } from '../../../../core/services/websocket';
import { Trade } from '../../../../core/models/trade.interface';
import { Subscription } from 'rxjs';

export type ChartType = 'Candlestick' | 'Line' | 'Area' | 'Bar';

@Component({
  selector: 'app-trading-chart',
  standalone: true,
  template: `<div #chartContainer class="chart-container"></div>`,
  styles: [`.chart-container { height: 500px; width: 100%; border-radius: 8px; overflow: hidden; }`]
})
export class TradingChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chartContainer') chartContainer!: ElementRef;
  private chart: any;
  private series: ISeriesApi<SeriesType> | null = null;
  private tradeSub!: Subscription;
  private currentCandle: any = null;
  private selectedInterval = 60;
  private currentChartType: ChartType = 'Candlestick';

  // Keep history of candles to repopulate chart when switching types
  private candles: any[] = [];
  private historicalData: any[] = [];
  private mode: 'Live' | 'Historical' = 'Live';

  constructor(private wsService: WebsocketService, private ngZone: NgZone) { }

  ngAfterViewInit() {
    this.chart = createChart(this.chartContainer.nativeElement, {
      width: this.chartContainer.nativeElement.clientWidth,
      height: 500,
      layout: {
        background: { type: ColorType.Solid, color: '#050511' }, // Match $bg-deep
        textColor: '#8b949e',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      localization: {
        locale: 'en-IN',
        timeFormatter: (time: number) => {
          const date = new Date(time * 1000);
          return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
        },
      },
      timeScale: { timeVisible: true, borderColor: 'rgba(255, 255, 255, 0.1)' }
    });

    this.initSeries();

    this.tradeSub = this.wsService.getTrade().subscribe((trade) => {
      if (!trade) return;
      if (this.mode === 'Live') {
        // Force chart update within Angular's Zone
        this.ngZone.run(() => {
          this.updateCandle(trade);
        });
      }
    });

    window.addEventListener('resize', () => {
      this.chart.applyOptions({ width: this.chartContainer.nativeElement.clientWidth });
    });
  }

  private initSeries() {
    if (this.series) {
      this.chart.removeSeries(this.series);
    }

    switch (this.currentChartType) {
      case 'Line':
        this.series = this.chart.addSeries(LineSeries, { color: '#26a69a', lineWidth: 2 });
        break;
      case 'Area':
        this.series = this.chart.addSeries(AreaSeries, {
          lineColor: '#26a69a',
          topColor: 'rgba(38, 166, 154, 0.28)',
          bottomColor: 'rgba(38, 166, 154, 0.05)'
        });
        break;
      case 'Bar':
        this.series = this.chart.addSeries(BarSeries, {
          upColor: '#26a69a', downColor: '#ef5350',
        });
        break;
      case 'Candlestick':
      default:
        this.series = this.chart.addSeries(CandlestickSeries, {
          upColor: '#26a69a', downColor: '#ef5350',
          wickUpColor: '#26a69a', wickDownColor: '#ef5350',
        });
        break;
    }

    // Repopulate data
    if (this.mode === 'Live') {
      const data = this.candles.map(c => this.mapCandleToSeriesData(c));
      this.series?.setData(data);
    } else if (this.historicalData.length > 0) {
      const data = this.historicalData.map(c => this.mapCandleToSeriesData(c));
      this.series?.setData(data);
    }
  }

  public setMode(mode: 'Live' | 'Historical') {
    this.mode = mode;
    if (mode === 'Live') {
      this.initSeries(); // Will load this.candles
      this.chart.timeScale().scrollToRealTime();
    } else {
      this.series?.setData([]);
    }
  }

  public setHistoricalData(data: any[]) {
    this.historicalData = data;
    if (this.mode === 'Historical') {
      const mapped = data.map(c => this.mapCandleToSeriesData(c));
      this.series?.setData(mapped);
      this.chart.timeScale().fitContent();
    }
  }

  public setChartType(type: ChartType) {
    if (this.currentChartType === type) return;
    this.currentChartType = type;
    this.initSeries();
  }

  public setTimeframe(minutes: number) {
    this.selectedInterval = minutes * 60;
    this.candles = [];
    this.currentCandle = null;
    if (this.mode === 'Live') {
      this.series?.setData([]);
    }
  }

  private updateCandle(trade: Trade) {
    const price = Number(trade.price);
    const timestamp = Math.floor(new Date(trade.time).getTime() / 1000);
    if (isNaN(price)) return;

    const candleTime = Math.floor(timestamp / this.selectedInterval) * this.selectedInterval;

    if (this.currentCandle && candleTime < this.currentCandle.time) return;

    if (!this.currentCandle || candleTime > this.currentCandle.time) {
      // New candle
      if (this.currentCandle) {
        this.candles.push({ ...this.currentCandle });
      }

      this.currentCandle = {
        time: candleTime as any,
        open: price, high: price, low: price, close: price
      };
    } else {
      // Update existing
      this.currentCandle.high = Math.max(this.currentCandle.high, price);
      this.currentCandle.low = Math.min(this.currentCandle.low, price);
      this.currentCandle.close = price;
    }

    if (this.series) {
      this.series.update(this.mapCandleToSeriesData(this.currentCandle));
    }
  }

  private mapCandleToSeriesData(candle: any) {
    if (this.currentChartType === 'Line' || this.currentChartType === 'Area') {
      return { time: candle.time, value: candle.close };
    }
    return candle;
  }

  ngOnDestroy() {
    if (this.tradeSub) this.tradeSub.unsubscribe();
    if (this.chart) this.chart.remove();
  }
}