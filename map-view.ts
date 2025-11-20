import { BasesView } from 'obsidian';
import { renderMapSVGFromEntries, MapOptions } from './map-visualization';

export const MAP_VIEW_TYPE = 'relative-map-view';

export class MapBasesView extends BasesView {
  readonly type = MAP_VIEW_TYPE;
  private containerEl: HTMLElement;

  constructor(controller: any, parentEl: HTMLElement) {
    super(controller);
    this.containerEl = parentEl.createDiv('map-view-container');
  }

  public onOpen(): void {
    this.containerEl.empty();
    this.containerEl.createDiv({ text: 'Loading map…' });
  }

  public onClose(): void {
    this.containerEl.empty();
  }

  public onDataUpdated(): void {
    const data = this.data;
    const app = this.app;

    this.containerEl.empty();

    if (!data) {
      this.containerEl.createDiv({ text: 'No data available.' });
      return;
    }

    const entries: any[] = (data as any)?.data;
    if (!entries || !entries.length) {
      this.containerEl.createDiv({ text: 'No files in this base.' });
      return;
    }

    const mapOptions: MapOptions = {
      width: 1024,
      height: 768,
      defaultEdgeLengthRel: 0.5,
      iterations: 400,
      stiffness: 0.08,
      damping: 0.85,
    };

    const svg = renderMapSVGFromEntries(app, entries, mapOptions);
    const wrapper = this.containerEl.createDiv({ cls: 'map-view-svg-wrapper' });
    wrapper.appendChild(svg);
  }
}
