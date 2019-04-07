import {
  AfterViewInit,
  Component, ElementRef, OnChanges, OnDestroy,
  OnInit, SimpleChanges, ViewChild,
} from '@angular/core';
import {PageEditorService} from './page-editor.service';
import {DesignHtmlJson, PageInfoModel} from './interface';
import {RaDesignKeyMapService} from '../../design-key-map/ra-design-key-map.service';

@Component({
  selector: 'ra-design-page-editor',
  template: `
    <div class="page-editor">
      <div class="page-editor-content" designDrop="page-editor" [designData]="stageID" (wheel)="onMouseWheel($event)">
        <div class="page-editor-content__left_top" #topLeft>
          <ng-template [design-dynamic]="dynamicHtml"></ng-template>
        </div>
      </div>
      <div class="page-editor-footer">
      </div>
    </div>
  `,
  styles: []
})
export class PageEditorInterface implements OnInit, AfterViewInit, OnDestroy {
  pageInfo: PageInfoModel;
  stageID: string;
  wheelOption = {
    size: 1,
  }
  private dynamicHtml: string;
  @ViewChild('topLeft') topLeft: ElementRef;

  constructor(
    public ElementRef: ElementRef<HTMLElement>,
    public PageEditorService: PageEditorService,
    public RaDesignKeyMapService: RaDesignKeyMapService,
  ) {
  }

  ngOnInit() {
    this.PageEditorService.findOne(this.stageID).subscribe((pageInfo) => {
      this.pageInfo = pageInfo;
    });
    this.RaDesignKeyMapService.registerListenerWindow('stage_page_editor', this.ElementRef.nativeElement, {stageID: this.stageID}).subscribe((event) => {
      switch (event.emitKey) {
        case 'delete':
          const selection = this.PageEditorService.getSelection(this.stageID);
          if (selection.length > 0) {
            this.PageEditorService.deleteNodeJson(selection[0]);
          }
          break;
      }
    });
  }

  ngAfterViewInit() {
    this.PageEditorService.subscribe(this.stageID, (event) => {
      switch (event.type) {
        case 'update-dynamic-html':
          this.dynamicHtml = event.data;
          break;
      }
    });
  }

  onMouseWheel($event: WheelEvent) {
    if ($event.ctrlKey) {
      $event.preventDefault();
      if ($event.deltaY > 0) {
        this.wheelOption.size -= 0.1;
      } else {
        this.wheelOption.size += 0.1;
      }
      const element: HTMLElement = this.topLeft.nativeElement;
      element.style.transform = `translate3d(0px, 0px, 0px) scale(${this.wheelOption.size}, ${this.wheelOption.size})`;
      element.style.transformOrigin = '0 0';
      element.style.display = 'block';
    }
  }

  ngOnDestroy() {
    this.PageEditorService.modify(this.stageID).subscribe(() => {
    });
    this.PageEditorService.deleteHtmlJson(this.stageID);
  }
}
