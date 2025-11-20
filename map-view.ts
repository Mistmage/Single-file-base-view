import { BasesView } from 'obsidian';
import { renderMapSVGFromEntries, MapOptions } from './map-visualization';
import type InputViewPlugin from './main';

export const MAP_VIEW_TYPE = 'relative-map-view';

export class MapBasesView extends BasesView {
  readonly type = MAP_VIEW_TYPE;
  private containerEl: HTMLElement;
  private plugin: InputViewPlugin;

  constructor(controller: any, parentEl: HTMLElement, plugin: InputViewPlugin) {
    super(controller);
    this.containerEl = parentEl.createDiv('map-view-container');
    this.plugin = plugin;
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

    const s = this.plugin.settings;
    const mapOptions: MapOptions = {
      width: 1024,
      height: 768,
      defaultEdgeLengthRel: s.defaultEdgeLengthRel,
      iterations: s.iterations,
      stiffness: s.stiffness,
      damping: s.damping,
      distancesKeys: s.distancesKeys,
      sizeKey: s.sizeKey,
      colorKey: s.colorKey,
      typeKey: s.typeKey,
      nameKey: s.nameKey,
      resolveLinks: s.resolveLinks,
      normalizeAbsoluteLengths: s.normalizeAbsoluteLengths,
    };

    const svg = renderMapSVGFromEntries(app, entries, mapOptions);
    const wrapper = this.containerEl.createDiv({ cls: 'map-view-svg-wrapper' });
    wrapper.appendChild(svg);
  }
}
