import { deflateRawSync } from 'node:zlib';
import { drawioPlainLabel, readDrawioPages, summarizeDrawioPage } from '../drawio-file.js';

const MODEL = `<mxGraphModel><root>
  <mxCell id="0"/><mxCell id="1" parent="0"/>
  <mxCell id="lane" value="Checkout" style="swimlane;html=1;" vertex="1" parent="1"/>
  <mxCell id="a" value="&lt;b&gt;Cart&lt;/b&gt;&amp;nbsp;page" style="rounded=1;whiteSpace=wrap;" vertex="1" parent="lane"/>
  <UserObject label="Pay" id="b"><mxCell style="ellipse;" vertex="1" parent="lane"/></UserObject>
  <mxCell id="e1" style="edgeStyle=orthogonal;" edge="1" parent="1" source="a" target="b"/>
  <mxCell id="e1l" value="submit" style="edgeLabel;html=1;" vertex="1" connectable="0" parent="e1"/>
  <mxCell id="e2" value="retry" edge="1" parent="1" source="b"/>
</root></mxGraphModel>`;

const compress = (xml: string) => deflateRawSync(Buffer.from(encodeURIComponent(xml))).toString('base64');

describe('draw.io diagram files', () => {
  it('reads each page, inflating compressed ones', () => {
    const file = `<mxfile><diagram id="p1" name="Flow">${MODEL}</diagram><diagram id="p2" name="Old &amp; packed">${compress(MODEL)}</diagram></mxfile>`;

    const pages = readDrawioPages(file);

    expect(pages.map((page) => page.name)).toEqual(['Flow', 'Old & packed']);
    expect(pages[1].xml).toBe(MODEL);
  });

  it('treats a bare model as one page', () => {
    expect(readDrawioPages(MODEL)).toEqual([{ name: 'Page-1', xml: MODEL }]);
  });

  it('summarizes a page as labelled shapes and the connections between them', () => {
    expect(summarizeDrawioPage({ name: 'Flow', xml: MODEL })).toEqual({
      name: 'Flow',
      shapes: [
        { id: 'b', label: 'Pay', shape: 'ellipse', in: 'Checkout' },
        { id: 'lane', label: 'Checkout', shape: 'swimlane' },
        { id: 'a', label: 'Cart page', in: 'Checkout' },
      ],
      connections: [
        { from: 'Cart page', to: 'Pay', label: 'submit' },
        { from: 'Pay', to: '(unconnected)', label: 'retry' },
      ],
    });
  });

  it('reads a label as the text it shows: tags dropped, line breaks as spaces, escaped characters as written', () => {
    expect(drawioPlainLabel('&lt;div&gt;Order&lt;br&gt;service&lt;/div&gt;&lt;div&gt;v2&lt;/div&gt;')).toBe('Order service v2');
    expect(drawioPlainLabel('&lt;b&gt;Ca&lt;/b&gt;rt')).toBe('Cart');
    expect(drawioPlainLabel('a &amp;lt;script&amp;gt; tag')).toBe('a <script> tag');
    expect(drawioPlainLabel(undefined)).toBe('');
  });

});

