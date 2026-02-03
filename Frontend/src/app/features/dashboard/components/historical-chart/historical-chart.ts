import { Component, ElementRef, ViewChild, AfterViewInit, OnChanges, Input, Injectable, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { createChart, ColorType, LineSeries } from 'lightweight-charts';

@Component({
    selector: 'app-historical-chart',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="historical-wrapper">
      <div #chartContainer class="chart-container"></div>
      <div *ngIf="loading" class="loading-overlay">Loading History...</div>
      <div *ngIf="error" class="error-overlay">{{ error }}</div>
    </div>
  `,
    styles: [`
    .historical-wrapper { position: relative; height: 400px; width: 100%; }
    .chart-container { height: 100%; width: 100%; border-radius: 8px; overflow: hidden; }
    .loading-overlay, .error-overlay {
      position: absolute; top: 0; left: 0; right: 0; bottom: 0;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.7); color: #fff; font-family: 'Inter', sans-serif;
    }
    .error-overlay { color: #ff0055; }
  `]
})
export class HistoricalChartComponent implements AfterViewInit, OnChanges {
    @ViewChild('chartContainer') chartContainer!: ElementRef;
    @Input() startDate!: string;
    @Input() endDate!: string;

    private chart: any;
    private lineSeries: any;
    loading = false;
    error = '';

    ngAfterViewInit() {
        this.initChart();
    }

    ngOnChanges(changes: SimpleChanges) {
        if ((changes['startDate'] || changes['endDate']) && this.chart) {
            if (this.startDate && this.endDate) {
                this.fetchHistory();
            }
        }
    }

    private initChart() {
        this.chart = createChart(this.chartContainer.nativeElement, {
            width: this.chartContainer.nativeElement.clientWidth,
            height: 400,
            layout: {
                background: { type: ColorType.Solid, color: '#050511' },
                textColor: '#8b949e',
            },
            grid: {
                vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
                horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
            },
            timeScale: {
                timeVisible: true,
                borderColor: 'rgba(255, 255, 255, 0.1)',
                tickMarkFormatter: (time: number, tickMarkType: any, locale: any) => {
                    const date = new Date(time * 1000);
                    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                }
            },
            localization: {
                timeFormatter: (time: number) => {
                    const date = new Date(time * 1000);
                    return date.toLocaleString('en-IN', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                    });
                }
            }
        });

        this.lineSeries = this.chart.addSeries(LineSeries, {
            color: '#00f2ff',
            lineWidth: 2,
        });

        window.addEventListener('resize', () => {
            this.chart.applyOptions({ width: this.chartContainer.nativeElement.clientWidth });
        });

        // Initial load
        if (this.startDate && this.endDate) {
            this.fetchHistory();
        }
    }

    private async fetchHistory() {
        this.loading = true;
        this.error = '';

        try {
            // Fetch from backend
            const response = await fetch(`http://localhost:3000/api/history?start=${this.startDate}&end=${this.endDate}`);
            const data = await response.json();

            if (data.error) throw new Error(data.error);

            // Transform data for Lightweight Charts
            // Expected format: { time: number | string, value: number }
            const chartData = data.map((t: any) => ({
                time: new Date(t.timestamp).getTime() / 1000,
                value: Number(t.price)
            }));

            // Lightweight charts requires sorted data with unique timestamps
            // We might have duplicates if trades happen in same millisecond, simple de-dupe
            const uniqueData = new Map();
            chartData.forEach((item: any) => uniqueData.set(item.time, item));
            const sortedData = Array.from(uniqueData.values()).sort((a: any, b: any) => a.time - b.time);

            this.lineSeries.setData(sortedData);
            this.chart.timeScale().fitContent();

        } catch (err: any) {
            this.error = "Failed to load history: " + err.message;
        } finally {
            this.loading = false;
        }
    }
}
