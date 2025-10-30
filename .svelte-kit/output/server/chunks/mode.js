import { w as writable } from "./index.js";
const initialMode = () => {
  return "view";
};
const modeStore = writable(initialMode(), (set) => {
  return;
});
modeStore.subscribe((value) => {
  return;
});
export {
  modeStore as m
};
