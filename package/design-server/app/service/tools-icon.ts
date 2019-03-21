import {Service} from 'egg';
import {parse, stringify} from '../lib/himalaya';

/**
 * 工具栏-页面管理 Service
 */
export default class ToolsPageService extends Service {
  async fetchIconfont(scriptUrl: string): Promise<Array<{ name: string, symbol: string, viewBox: string }>> {
    const result = await this.ctx.curl(scriptUrl, {dataType: 'text'});
    const scriptContext: string = result.data;
    const svgText = scriptContext.match('\\<svg>.*\\</svg>');
    const icons: Array<{ name: string, viewBox: string, symbol: string }> = [];
    if (svgText) {
      const json = parse(svgText.toString())[0];
      if (!json.children) {
        return [];
      }
      json.children.forEach((symbol) => {
        const name = symbol.attributes ? symbol.attributes.find((attr) => {
          return attr.key === 'id';
        })!.value : '';
        const viewBox = symbol.attributes ? symbol.attributes.find((attr) => {
          return attr.key === 'viewBox';
        })!.value : '';
        icons.push({
          name: name,
          viewBox: viewBox,
          symbol: stringify(symbol.children),
        });
      });
    }
    return icons;
  }

  async generate(icons: Array<{ name: string, symbol: string }>): Promise<string> {
    const code = await this.ctx.renderView('icon.ts.ejs', {
      data: icons,
      ctx: this.ctx,
    });
    return code;
  }

  // a-b这种类型的字符串转换成驼峰
  toCamelCase(src: string, upperCaseFirstWord: boolean = true): string {
    if (!src) {
      return '';
    }
    // 首字母大写
    upperCaseFirstWord ? (src = src[0].toUpperCase() + src.slice(1)) : (src = src[0].toLowerCase() + src.slice(1));
    // 后面驼峰
    return src.replace(/[-_]([a-z])/g, (_match, $1) => {
      return $1.toUpperCase();
    });
  }
}