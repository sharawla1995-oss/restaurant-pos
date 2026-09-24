'use strict';

module.exports=Object.freeze({
  fileName:'__fixture__/rogue-navigation-coverage.js',
  index:'<button data-page="rogueRoute">Rogue</button>',
  sources:Object.freeze({
    '__fixture__/rogue-navigation-coverage.js':[
      "const nav=document.querySelector('#nav');",
      "const b=document.createElement('button');",
      "b.dataset.roguePage='rogueRoute';",
      "b.id='rogueNav';",
      "nav.appendChild(b);"
    ].join('\n')
  })
});
