'use strict';

// Negative detector fixture: this must NEVER be accepted as a declared owner.
// The 1C checker feeds it to the detector in-memory and expects rejection.
module.exports=Object.freeze({
  fileName:'__fixture__/rogue-navigation-owner.js',
  source:'const rogueDispatch={orders:renderRogueOrders,purchasing:renderRoguePurchasing};'
});
