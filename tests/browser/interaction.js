export function clickOrTap(locator, touch = false) {
  return touch ? locator.tap() : locator.click();
}
