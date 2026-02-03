import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Trade } from '../models/trade.interface';

@Injectable({
  providedIn: 'root',
})
export class WebsocketService {
  private socket!: WebSocket;

  // 1. Switch to BehaviorSubject so new subscribers get the last trade immediately
  // Initialize with null or a default trade object
  private tradeSubject = new BehaviorSubject<Trade | null>(null);
  private isConnected = new BehaviorSubject<boolean>(false);

  constructor(private ngZone: NgZone) {
    this.connect();
  }

  private connect(): void {
    // Replace with your production URL if necessary
    this.socket = new WebSocket('ws://localhost:3000');

    this.socket.onopen = () => {
      console.log("✅ Connected to Backend WebSocket");
      this.ngZone.run(() => this.isConnected.next(true));
    };

    this.socket.onmessage = (event) => {
      try {
        const data: Trade = JSON.parse(event.data);

        // Validation check
        if (data && data.price) {
          this.ngZone.run(() => {
            this.tradeSubject.next(data);
          });
        }
      } catch (err) {
        console.error("❌ Error parsing WebSocket message:", err);
      }
    };

    this.socket.onclose = () => {
      console.warn('⚠️ Connection lost. Retrying in 3 seconds...');
      this.ngZone.run(() => this.isConnected.next(false));
      setTimeout(() => this.connect(), 3000);
    };

    this.socket.onerror = (error) => {
      console.error("🚀 WebSocket Error:", error);
    };
  }

  // 2. Return the observable as Trade | null to handle the initial state
  getTrade(): Observable<Trade | null> {
    return this.tradeSubject.asObservable();
  }

  // 3. Helper to get the current state without an observable (useful for quick checks)
  getAllTrades(): Trade | null {
    return this.tradeSubject.getValue();
  }

  getIsConnected(): Observable<boolean> {
    return this.isConnected.asObservable();
  }
}