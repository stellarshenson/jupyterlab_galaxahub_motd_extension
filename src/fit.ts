/*
 * The fit of an html entry frame to its page. This module imports nothing, so the acceptance
 * sweep (ui-tests/fit-sweep) loads its compiled form as it is.
 */

/**
 * Fit an html entry frame to its page: the page root's height plus any content past the root,
 * plus the frame's borders and any horizontal scrollbar. A hidden frame keeps its height. A page
 * that cannot be measured keeps the stylesheet's 480 px box and scrolls inside it: a root as tall
 * as the frame's viewport (html, body { height: 100% }), a root that follows the frame's height
 * (vh units), content past the root that follows the frame's height (positioned against the
 * viewport's bottom) or nothing in flow (only absolute or fixed content).
 */
export function fitFrame(frame: HTMLIFrameElement): void {
  const page = frame.contentDocument;
  const inner = frame.contentWindow;
  if (!page?.body || !inner || !frame.offsetHeight) {
    return;
  }
  const root = page.documentElement;
  const view = page.scrollingElement ?? root;
  // the page is fitted with its vertical scrollbar hidden. A fitted page that grows gets a
  // scrollbar, which takes width from it; a page whose height follows its width (an image as
  // wide as the page) is then shorter, and a frame fitted to that height keeps the scrollbar
  // with nothing to scroll, because the page is taller again without it. The overflow is hidden
  // on the element the frame's viewport takes it from, the root, or the body while the root's
  // is visible; on that element it changes nothing else in the page
  const rootStyle = inner.getComputedStyle(root);
  const holder =
    rootStyle.overflowX === 'visible' && rootStyle.overflowY === 'visible'
      ? page.body
      : root;
  const overflow = holder.style.overflowY;
  holder.style.overflowY = 'hidden';
  fitToPage(frame, page, inner);
  // between two fits the page has its own overflow: the scrollbar of a page that grows past
  // its frame changes the root's width, and that change is what reports the growth
  holder.style.overflowY = overflow;
  // the browser gives the scroll heights in whole px and shows a scrollbar for a fraction of
  // a px, so the scrollbar is the test: while it shows, the frame gets 1 px more, twice at most
  const scrollbar = () => inner.innerWidth > view.clientWidth;
  const fitted = parseFloat(frame.style.height);
  for (let px = 1; px <= 2 && fitted && scrollbar(); px++) {
    frame.style.height = `${fitted + px}px`;
  }
  // a scrollbar that stays is the page's own rule (overflow-y: scroll), and the page is
  // narrower with it: the frame is fitted to the page as it is then
  if (fitted && scrollbar()) {
    fitToPage(frame, page, inner);
  }
}

/**
 * One fit of fitFrame, with the page as it is now. Heights are read with their fractions: at a
 * device scale that is not a whole number (display scaling 125 %, browser zoom 110 %) a border
 * and a page are not a whole number of px tall. The scroll heights and the height of a
 * horizontal scrollbar are whole numbers only; they are read from the page's scrolling element,
 * which is the root in standards mode and the body in quirks mode.
 */
function fitToPage(
  frame: HTMLIFrameElement,
  page: Document,
  inner: Window
): void {
  const root = page.documentElement;
  const view = page.scrollingElement ?? root;
  const style = getComputedStyle(frame);
  const rootHeight = () => root.getBoundingClientRect().height;
  // what the frame adds around its page's viewport: its borders and any horizontal scrollbar
  const around = () =>
    parseFloat(style.borderTopWidth) +
    parseFloat(style.borderBottomWidth) +
    inner.innerHeight -
    view.clientHeight;
  // whether the frame's viewport is `height` tall: to less than half a px, or to less than
  // 1.5 px under a horizontal scrollbar, whose whole-px height can differ by 1 between two reads
  const fills = (height: number) =>
    Math.abs(height + around() - frame.getBoundingClientRect().height) <
    (inner.innerHeight > view.clientHeight ? 1.5 : 0.5);
  // the viewport is set to the root's height plus the content past the root (a margin on the
  // html element, content positioned or pulled below the body), six times at most. A new height
  // can move a scrollbar in the frame and wrap the page again, so it is set until the viewport
  // is that tall; then the px that still scroll are added to the content past the root, until
  // none scroll. Only a frame this call or an earlier one fitted gets them: a root as tall as
  // the 480 px box is fitted or sized to the frame and is left as it is
  let past = 0;
  for (let i = 0; i < 6; i++) {
    if (fills(rootHeight() + past)) {
      if (!frame.style.height || view.scrollHeight <= view.clientHeight) {
        break;
      }
      past += view.scrollHeight - view.clientHeight;
    }
    // the browser keeps a height in 1/64 px, rounded down; 0.02 px keeps the viewport from
    // ending that much shorter than its page
    frame.style.height = `${rootHeight() + past + around() + 0.02}px`;
  }
  if (
    !fills(rootHeight() + past) ||
    view.scrollHeight > view.clientHeight ||
    !page.body.offsetHeight
  ) {
    frame.style.height = '';
  }
}
