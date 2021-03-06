/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {Injectable, NgZone, OnDestroy, Inject} from '@angular/core';
import {DOCUMENT} from '@angular/common';
import {normalizePassiveListenerOptions} from '@angular/cdk/platform';
import {Subject} from 'rxjs';
import {DragRefInterface} from './ref/interface/drag-ref.interface';

/** Event options that can be used to bind an active, capturing event. */
const activeCapturingEventOptions = normalizePassiveListenerOptions({
  passive: false,
  capture: true
});

@Injectable({providedIn: 'root'})
export class DragDropRegistry<I extends DragRefInterface<any>> implements OnDestroy {
  private _document: Document;

  /** Registered drop container instances. */
  private _dropInstances = new Set<any>();

  /** Registered drag item instances. */
  private _dragInstances = new Set<I>();

  /** Drag item instances that are currently being dragged. */
  private _activeDragInstances = new Set<I>();

  /** Keeps track of the event listeners that we've bound to the `document`. */
  private _globalListeners = new Map<string, {
    handler: (event: Event) => void,
    options?: AddEventListenerOptions | boolean
  }>();

  /**
   * Emits the `touchmove` or `mousemove` events that are dispatched
   * while the user is dragging a drag item instance.
   */
  readonly pointerMove: Subject<TouchEvent | MouseEvent> = new Subject<TouchEvent | MouseEvent>();

  /**
   * Emits the `touchend` or `mouseup` events that are dispatched
   * while the user is dragging a drag item instance.
   */
  readonly pointerUp: Subject<TouchEvent | MouseEvent> = new Subject<TouchEvent | MouseEvent>();

  constructor(
    private _ngZone: NgZone,
    @Inject(DOCUMENT) _document: any) {
    this._document = _document;
  }

  /** Adds a drag item instance to the registry. */
  registerDragItem(drag: I) {
    this._dragInstances.add(drag);

    // The `touchmove` event gets bound once, ahead of time, because WebKit
    // won't preventDefault on a dynamically-added `touchmove` listener.
    // See https://bugs.webkit.org/show_bug.cgi?id=184250.
    if (this._dragInstances.size === 1) {
      this._ngZone.runOutsideAngular(() => {
        // The event handler has to be explicitly active,
        // because newer browsers make it passive by default.
        this._document.addEventListener('touchmove', this._preventDefaultWhileDragging,
          activeCapturingEventOptions);
      });
    }
  }

  /**
   * Starts the dragging sequence for a drag instance.
   * @param drag Drag instance which is being dragged.
   * @param event Event that initiated the dragging.
   */
  startDragging(drag: I, event: TouchEvent | MouseEvent) {
    this._activeDragInstances.add(drag);

    if (this._activeDragInstances.size === 1) {
      const isTouchEvent = event.type.startsWith('touch');
      const moveEvent = isTouchEvent ? 'touchmove' : 'mousemove';
      const upEvent = isTouchEvent ? 'touchend' : 'mouseup';

      // We explicitly bind __active__ listeners here, because newer browsers will default to
      // passive ones for `mousemove` and `touchmove`. The events need to be active, because we
      // use `preventDefault` to prevent the page from scrolling while the user is dragging.
      this._globalListeners
        .set(moveEvent, {
          handler: (e: Event) => this.pointerMove.next(e as TouchEvent | MouseEvent),
          options: activeCapturingEventOptions
        })
        .set(upEvent, {
          handler: (e: Event) => this.pointerUp.next(e as TouchEvent | MouseEvent),
          options: true
        })
        // Preventing the default action on `mousemove` isn't enough to disable text selection
        // on Safari so we need to prevent the selection event as well. Alternatively this can
        // be done by setting `user-select: none` on the `body`, however it has causes a style
        // recalculation which can be expensive on pages with a lot of elements.
        .set('selectstart', {
          handler: this._preventDefaultWhileDragging,
          options: activeCapturingEventOptions
        });

      // TODO(crisbeto): prevent mouse wheel scrolling while
      // dragging until we've set up proper scroll handling.
      if (!isTouchEvent) {
        this._globalListeners.set('wheel', {
          handler: this._preventDefaultWhileDragging,
          options: activeCapturingEventOptions
        });
      }

      this._ngZone.runOutsideAngular(() => {
        this._globalListeners.forEach((config, name) => {
          this._document.addEventListener(name, config.handler, config.options);
        });
      });
    }
  }

  /** Stops dragging a drag item instance. */
  stopDragging(drag: I) {
    this._activeDragInstances.delete(drag);

    if (this._activeDragInstances.size === 0) {
      this._clearGlobalListeners();
    }
  }

  /** Gets whether a drag item instance is currently being dragged. */
  isDragging(drag: I) {
    return this._activeDragInstances.has(drag);
  }

  ngOnDestroy() {
  }

  /**
   * Event listener that will prevent the default browser action while the user is dragging.
   * @param event Event whose default action should be prevented.
   */
  private _preventDefaultWhileDragging = (event: Event) => {
    if (this._activeDragInstances.size) {
      event.preventDefault();
    }
  }

  /** Clears out the global event listeners from the `document`. */
  private _clearGlobalListeners() {
    this._globalListeners.forEach((config, name) => {
      this._document.removeEventListener(name, config.handler, config.options);
    });

    this._globalListeners.clear();
  }
}
