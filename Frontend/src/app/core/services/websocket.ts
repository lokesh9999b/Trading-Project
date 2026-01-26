import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import {Trade} from '../models/trade.interface';
@Injectable({
  providedIn: 'root',
})
export class WebsocketService {
  private socket!: WebSocket;
  private tradeSubject =new Subject<Trade>();
  constructor() { 
    this.connect();
  }
  private connect(): void {
    this.socket = new WebSocket('ws://localhost:3000');
    this.socket.onopen = (event) => {
      console.log("Connected to Backend WebSocket");
    };
    this.socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data && data.price){
        this.tradeSubject.next(data);
        console.log("Received message from Backend WebSocket");
      }
    };
    this.socket.onclose = (event) => {
      console.log('⚠️ Connection lost. Retrying in 3 seconds...');
      setTimeout(() => this.connect(), 3000);
    };
    this.socket.onerror = (event) => {
      console.log("Error from Backend WebSocket");
    };
  }
  getTrade(): Observable<Trade> {
    return this.tradeSubject.asObservable();
  }   
}
