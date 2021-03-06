import {ChangeDetectorRef, Component, ComponentFactory, OnInit, ViewChild, ViewContainerRef} from '@angular/core';
import {CdkDragDrop, moveItemInArray} from '../cdk-drag-drop';
import {RaDesignStageService} from './ra-design-stage.service';
import {RaDesignDragDirective, RaDesignDropDirective, DesignDragDrop} from '../design-drag-drop';
import {StageTabModel} from './interface';


@Component({
  selector: 'ra-design-stage',
  template: `
    <!-- stage的上方上任务栏 -->
    <div class="stage-bar" designDrop (onDesignDropped)="onDesignDropped($event)" (wheel)="onMouseWheel($event)">
      <ng-container *ngFor="let stageTab of RaDesignStageService.stageList">
        <!-- TODO cdkDragBoundary=".stage-bar" 限制移动元素 -->
        <li class="stage-bar-item" [class.is-select]="stageTab.select" (click)="select(stageTab)"
            [style.order]="stageTab.order" designDrag="stage-bar-item">
          <i nz-icon [type]="stageTab.icon"></i>
          <span>{{stageTab.title}}</span>
          <i nz-icon type="close" theme="outline" (click)="close($event,stageTab)"></i>
        </li>
      </ng-container>
    </div>
    <div class="editor-stage-main">
      <ng-template #main></ng-template>
    </div>
  `,
  styles: []
})
export class RaDesignStageComponent implements OnInit {

  @ViewChild('main', {read: ViewContainerRef}) main: ViewContainerRef;

  constructor(
    public RaDesignStageService: RaDesignStageService,
    public ChangeDetectorRef: ChangeDetectorRef) {
    this.RaDesignStageService.init(this);
  }

  ngOnInit() {
  }

  showTools(componentFactory: ComponentFactory<any>, data) {
    this.main.clear();
    const a = this.main.createComponent(componentFactory);
    a.instance.img = data;
  }

  select(tools: StageTabModel) {
    this.RaDesignStageService.openStage(tools.id);
  }

  drop(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.RaDesignStageService.stageList, event.previousIndex, event.currentIndex);
  }

  onDesignDropped($event: DesignDragDrop<any>) {
    moveItemInArray(this.RaDesignStageService.stageList, $event.currentIndex, $event.previousIndex);
  }

  close($event: MouseEvent, stageTab: StageTabModel) {
    if (stageTab.select && this.RaDesignStageService.stageList.length > 1) {
      const index = this.RaDesignStageService.stageList.indexOf(stageTab);
      const nextStageTab = this.RaDesignStageService.stageList[index + 1] || this.RaDesignStageService.stageList[index - 1];
      this.RaDesignStageService.openStage(nextStageTab.id);
    } else if (this.RaDesignStageService.stageList.length === 1) {
      this.main.clear();
    }
    this.RaDesignStageService.deleteStage(stageTab.id);
  }

  onMouseWheel($event) {

  }
}
