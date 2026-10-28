// Retain the original controller and expose a presentation-only after-paint hook.
(() => {
  const create=window.WuXingMotion.create;
  window.WuXingMotion.create=function(options){
    const paint=step=>{
      options.paint(step);
      document.dispatchEvent(new CustomEvent('wuxing-paint',{detail:{step}}));
    };
    const controller=create({...options,paint});
    window.TCMRotation=controller;
    // Repainting never changes the original order, selected column or rotation.
    window.TCMWheelView={repaint:()=>paint(controller.value)};
    return controller;
  };
})();
