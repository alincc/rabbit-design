import {ElementRef, EmbeddedViewRef, NgZone, TemplateRef, ViewContainerRef} from '@angular/core';
import {normalizePassiveListenerOptions} from '@angular/cdk/platform';

import {DragRefInterface} from './interface/drag-ref.interface';
import {coerceBooleanProperty} from '@angular/cdk/coercion';
import {DragDropRegistry} from '../drag-drop-registry';
import {RaDesignDragDirective} from '../ra-design-drag.directive';
import {Subscription} from 'rxjs';
import {extendStyles, toggleNativeDragInteractions} from '../../cdk-drag-drop/drag-styling';
import {Directionality} from '@angular/cdk/bidi';
import {ViewportRuler} from '@angular/cdk/overlay';

/** Options that can be used to bind a passive event listener. */
const passiveEventListenerOptions = normalizePassiveListenerOptions({passive: true});

/** Options that can be used to bind an active event listener. */
const activeEventListenerOptions = normalizePassiveListenerOptions({passive: false});

const DRAG_START_THRESHOLD = 5;

/** Point on the page or within an element. */
interface Point {
  x: number;
  y: number;
}

/**
 * Gets a 3d `transform` that can be applied to an element.
 * @param x Desired position of the element along the X axis.
 * @param y Desired position of the element along the Y axis.
 */
function getTransform(x: number, y: number): string {
  // Round the transforms since some browsers will
  // blur the elements for sub-pixel transforms.
  return `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
}

/**
 * Template that can be used to create a drag helper element (e.g. a preview or a placeholder).
 */
interface DragHelperTemplate<T = any> {
  templateRef: TemplateRef<T>;
  data: T;
}

export class RelativeDragRef<T> implements DragRefInterface<T> {
  data: T;
  DragDropRegistry: DragDropRegistry<RelativeDragRef<T>>;
  NgZone: NgZone;
  ViewContainerRef: ViewContainerRef;
  Document: Document;
  Directionality: Directionality;
  ViewportRuler: ViewportRuler;

  _rootElement: HTMLElement;

  /** Element displayed next to the user's pointer while the element is dragged. */
  private _preview: HTMLElement;

  /** Reference to the view of the preview element. */
  private _previewRef: EmbeddedViewRef<any> | null;

  /** Reference to the view of the placeholder element. */
  private _placeholderRef: EmbeddedViewRef<any> | null;

  /** Element that is rendered instead of the draggable item while it is being sorted. */
  private _placeholder: HTMLElement;

  _hasStartedDragging: boolean = false; // 是否在拖拽中

  /** Subscription to pointer movement events. */
  private _pointerMoveSubscription = Subscription.EMPTY;
  /** Subscription to the event that is dispatched when the user lifts their pointer. */
  private _pointerUpSubscription = Subscription.EMPTY;

  /** Coordinates on the page at which the user picked up the element. */
  private _pickupPositionOnPage: Point;

  /** Element that will be used as a template to create the draggable item's preview. */
  private _previewTemplate: DragHelperTemplate | null;
  /** Template for placeholder element rendered to show where a draggable would be dropped. */
  private _placeholderTemplate: DragHelperTemplate | null;

  /** CSS `transform` that is applied to the element while it's being dragged. */
  private _activeTransform: Point = {x: 0, y: 0};

  /** Inline `transform` value that the element had before the first dragging sequence. */
  private _initialTransform?: string;

  /** Cached scroll position on the page when the element was picked up. */
  private _scrollPosition: { top: number, left: number };

  /** Whether starting to drag this element is disabled. */
  get disabled(): boolean {
    return this._disabled;
  }

  set disabled(value: boolean) {
    const newValue = coerceBooleanProperty(value);

    if (newValue !== this._disabled) {
      this._disabled = newValue;
    }
  }

  private _disabled = false;


  constructor(public RaDesignDragDirective: RaDesignDragDirective) {
    this.DragDropRegistry = this.RaDesignDragDirective.DragDropRegistry as DragDropRegistry<RelativeDragRef<T>>;
    this.NgZone = this.RaDesignDragDirective.NgZone;
    this.ViewContainerRef = this.RaDesignDragDirective.ViewContainerRef;
    this.Document = this.RaDesignDragDirective.Document;
    this.Directionality = this.RaDesignDragDirective.Directionality;
    this.ViewportRuler = this.RaDesignDragDirective.ViewportRuler;
  }


  withRootElement(rootElement: ElementRef<HTMLElement> | HTMLElement): DragRefInterface {
    const element = rootElement instanceof ElementRef ? rootElement.nativeElement : rootElement;

    // TODO 下一步做切欢根节点(@angular/cdk/cdk-drag-drop/drag-ref.ts!withRootElement)
    element.addEventListener('mousedown', this._pointerDown, activeEventListenerOptions);
    element.addEventListener('touchstart', this._pointerDown, passiveEventListenerOptions);

    this._rootElement = element;

    return this;
  }

  /** Handler for the `mousedown`/`touchstart` events. */
  private _pointerDown = (event: MouseEvent | TouchEvent) => {
    // TODO (@angular/cdk/cdk-drag-drop/drag-ref.ts!_pointerDown)
    if (!this.disabled) {
      this._initializeDragSequence(this._rootElement, event);
    }
  };

  /**
   * Sets up the different variables and subscriptions
   * that will be necessary for the dragging sequence.
   * @param referenceElement Element that started the drag sequence.
   * @param event Browser event object that started the sequence.
   */
  private _initializeDragSequence(referenceElement: HTMLElement, event: MouseEvent | TouchEvent) {
    // Always stop propagation for the event that initializes
    // the dragging sequence, in order to prevent it from potentially
    // starting another sequence for a draggable parent somewhere up the DOM tree.
    event.stopPropagation();

    // const isDragging = this.isDragging();
    // const isTouchSequence = isTouchEvent(event);
    // const isAuxiliaryMouseButton = !isTouchSequence && (event as MouseEvent).button !== 0;
    // const rootElement = this._rootElement;
    // const isSyntheticEvent = !isTouchSequence && this._lastTouchEventTime &&
    //   this._lastTouchEventTime + MOUSE_EVENT_IGNORE_TIME > Date.now();

    // If the event started from an element with the native HTML drag&drop, it'll interfere
    // with our own dragging (e.g. `img` tags do it by default). Prevent the default action
    // to stop it from happening. Note that preventing on `dragstart` also seems to work, but
    // it's flaky and it fails if the user drags it away quickly. Also note that we only want
    // to do this for `mousedown` since doing the same for `touchstart` will stop any `click`
    // events from firing on touch devices.
    // if (event.target && (event.target as HTMLElement).draggable && event.type === 'mousedown') {
    //   event.preventDefault();
    // }

    // Abort if the user is already dragging or is using a mouse button other than the primary one.
    // if (isDragging || isAuxiliaryMouseButton || isSyntheticEvent) {
    //   return;
    // }

    // Cache the previous transform amount only after the first drag sequence, because
    // we don't want our own transforms to stack on top of each other.
    if (this._initialTransform == null) {
      this._initialTransform = this._rootElement.style.transform || '';
    }

    // If we've got handles, we need to disable the tap highlight on the entire root element,
    // otherwise iOS will still add it, even though all the drag interactions on the handle
    // are disabled.
    // if (this._handles.length) {
    //   this._rootElementTapHighlight = rootElement.style.webkitTapHighlightColor;
    //   rootElement.style.webkitTapHighlightColor = 'transparent';
    // }

    // this._toggleNativeDragInteractions();
    // this._hasStartedDragging = this._hasMoved = false;
    // this._initialContainer = this.dropContainer!;
    this._pointerMoveSubscription = this.DragDropRegistry.pointerMove.subscribe(this._pointerMove);
    this._pointerUpSubscription = this.DragDropRegistry.pointerUp.subscribe(this._pointerUp);
    this._scrollPosition = this.ViewportRuler.getViewportScrollPosition();

    // if (this._boundaryElement) {
    //   this._boundaryRect = this._boundaryElement.getBoundingClientRect();
    // }

    // If we have a custom preview template, the element won't be visible anyway so we avoid the
    // extra `getBoundingClientRect` calls and just move the preview next to the cursor.
    // this._pickupPositionInElement = this._previewTemplate ? {x: 0, y: 0} :
    //   this._getPointerPositionInElement(referenceElement, event);
    const pointerPosition = this._pickupPositionOnPage = this._getPointerPositionOnPage(event);
    // this._pointerDirectionDelta = {x: 0, y: 0};
    // this._pointerPositionAtLastDirectionChange = {x: pointerPosition.x, y: pointerPosition.y};
    this.DragDropRegistry.startDragging(this, event);
  }

  /** Handler that is invoked when the user moves their pointer after they've initiated a drag. */
  private _pointerMove = (event: MouseEvent | TouchEvent) => {
    if (!this._hasStartedDragging) {
      const pointerPosition = this._getPointerPositionOnPage(event);
      const distanceX = Math.abs(pointerPosition.x - this._pickupPositionOnPage.x);
      const distanceY = Math.abs(pointerPosition.y - this._pickupPositionOnPage.y);

      // Only start dragging after the user has moved more than the minimum distance in either
      // direction. Note that this is preferrable over doing something like `skip(minimumDistance)`
      // in the `pointerMove` subscription, because we're not guaranteed to have one move event
      // per pixel of movement (e.g. if the user moves their pointer quickly).
      if (distanceX + distanceY >= DRAG_START_THRESHOLD) {
        this._hasStartedDragging = true;
        this.NgZone.run(() => this._startDragSequence(event));
      }
      return;
    }
    const constrainedPointerPosition = this._getConstrainedPointerPosition(event);

    const activeTransform = this._activeTransform;
    activeTransform.x =
      constrainedPointerPosition.x - this._pickupPositionOnPage.x; // + this._passiveTransform.x;
    activeTransform.y =
      constrainedPointerPosition.y - this._pickupPositionOnPage.y; // + this._passiveTransform.y;
    const transform = getTransform(activeTransform.x, activeTransform.y);
    // Preserve the previous `transform` value, if there was one.
    this._rootElement.style.transform = this._initialTransform ?
      this._initialTransform + ' ' + transform : transform;

    // Apply transform as attribute if dragging and svg element to work for IE
    if (typeof SVGElement !== 'undefined' && this._rootElement instanceof SVGElement) {
      const appliedTransform = `translate(${activeTransform.x} ${activeTransform.y})`;
      this._rootElement.setAttribute('transform', appliedTransform);
    }
  };

  /** Starts the dragging sequence. */
  private _startDragSequence(event: MouseEvent | TouchEvent) {
    const element = this._rootElement;

    const preview = this._preview = this._createPreviewElement();
    const placeholder = this._placeholder = this._createPlaceholderElement();

    // We move the element out at the end of the body and we make it hidden, because keeping it in
    // place will throw off the consumer's `:last-child` selectors. We can't remove the element
    // from the DOM completely, because iOS will stop firing all subsequent events in the chain.
    // element.style.display = 'none'; // TODO cdk-drag
    this.Document.body.appendChild(element.parentNode.replaceChild(placeholder, element));
    this.Document.body.appendChild(preview);
  }

  /**
   * Returns the element that is being used as a placeholder
   * while the current element is being dragged.
   */
  getPlaceholderElement(): HTMLElement {
    return this._placeholder;
  }

  /** Returns the root draggable element. */
  getRootElement(): HTMLElement {
    return this._rootElement;
  }

  /**
   * Creates the element that will be rendered next to the user's pointer
   * and will be used as a preview of the element that is being dragged.
   */
  private _createPreviewElement(): HTMLElement {
    let preview: HTMLElement;

    if (this._previewTemplate) {
      const viewRef = this.ViewContainerRef.createEmbeddedView(this._previewTemplate.templateRef,
        this._previewTemplate.data);

      preview = viewRef.rootNodes[0];
      this._previewRef = viewRef;
      preview.style.transform =
        getTransform(this._pickupPositionOnPage.x, this._pickupPositionOnPage.y);
    } else {
      const element = this._rootElement;
      const elementRect = element.getBoundingClientRect();

      preview = deepCloneNode(element);
      preview.style.width = `${elementRect.width}px`;
      preview.style.height = `${elementRect.height}px`;
      preview.style.transform = getTransform(elementRect.left, elementRect.top);
    }

    extendStyles(preview.style, {
      // It's important that we disable the pointer events on the preview, because
      // it can throw off the `document.elementFromPoint` calls in the `CdkDropList`.
      pointerEvents: 'none',
      position: 'fixed',
      top: '0',
      left: '0',
      zIndex: '1000'
    });

    toggleNativeDragInteractions(preview, false);

    preview.classList.add('cdk-drag-preview');
    preview.setAttribute('dir', this.Directionality ? this.Directionality.value : 'ltr');

    return preview;
  }

  /** Creates an element that will be shown instead of the current element while dragging. */
  private _createPlaceholderElement(): HTMLElement {
    let placeholder: HTMLElement;

    if (this._placeholderTemplate) {
      this._placeholderRef = this.ViewContainerRef.createEmbeddedView(
        this._placeholderTemplate.templateRef,
        this._placeholderTemplate.data
      );
      placeholder = this._placeholderRef.rootNodes[0];
    } else {
      placeholder = deepCloneNode(this._rootElement);
    }

    placeholder.classList.add('cdk-drag-placeholder');
    return placeholder;
  }

  /** Gets the pointer position on the page, accounting for any position constraints. */
  private _getConstrainedPointerPosition(event: MouseEvent | TouchEvent): Point {
    const point = this._getPointerPositionOnPage(event);
    return point;
  }

  /** Handler that is invoked when the user lifts their pointer up, after initiating a drag. */
  private _pointerUp = (event: MouseEvent | TouchEvent) => {
    this.DragDropRegistry.stopDragging(this);
  };

  /** Determines the point of the page that was touched by the user. */
  private _getPointerPositionOnPage(event: MouseEvent | TouchEvent): Point {
    // `touches` will be empty for start/end events so we have to fall back to `changedTouches`.
    const point = isTouchEvent(event) ? (event.touches[0] || event.changedTouches[0]) : event;

    return {
      x: point.pageX - this._scrollPosition.left,
      y: point.pageY - this._scrollPosition.top
    };
  }
}

/** Creates a deep clone of an element. */
function deepCloneNode(node: HTMLElement): HTMLElement {
  const clone = node.cloneNode(true) as HTMLElement;
  // Remove the `id` to avoid having multiple elements with the same id on the page.
  clone.removeAttribute('id');
  return clone;
}

/** Determines whether an event is a touch event. */
function isTouchEvent(event: MouseEvent | TouchEvent): event is TouchEvent {
  return event.type.startsWith('touch');
}
