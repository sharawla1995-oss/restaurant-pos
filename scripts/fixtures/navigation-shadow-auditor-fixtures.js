'use strict';

module.exports=Object.freeze([
  Object.freeze({
    name:'ordinary route exact owner evidence',
    kind:'dispatch',
    routeKey:'customers',
    actual:Object.freeze({opened:true,rendererOwner:'app.js',renderer:'renderCustomers',navigationOwner:'app.js',augmentationLayers:Object.freeze([]),sourceEvidence:Object.freeze(['fixture:customers:app'])}),
    expected:'SHADOW_MATCH'
  }),
  Object.freeze({
    name:'ordinary route wrong owner',
    kind:'dispatch',
    routeKey:'customers',
    actual:Object.freeze({opened:true,rendererOwner:'rogue-owner.js',renderer:'renderCustomers',navigationOwner:'app.js',augmentationLayers:Object.freeze([]),sourceEvidence:Object.freeze(['fixture:customers:rogue'])}),
    expected:'SHADOW_MISMATCH'
  }),
  Object.freeze({
    name:'locked orders exact owner',
    kind:'dispatch',
    routeKey:'orders',
    actual:Object.freeze({opened:true,rendererOwner:'app.js',renderer:'renderOrders',navigationOwner:'app.js',augmentationLayers:Object.freeze([]),sourceEvidence:Object.freeze(['fixture:orders:v58.3'])}),
    expected:'SHADOW_LOCKED_MATCH'
  }),
  Object.freeze({
    name:'locked orders wrong owner',
    kind:'dispatch',
    routeKey:'orders',
    actual:Object.freeze({opened:true,rendererOwner:'beta43-offline-core.js',renderer:'renderOrders43',navigationOwner:'app.js',augmentationLayers:Object.freeze([]),sourceEvidence:Object.freeze(['fixture:orders:wrong-owner'])}),
    expected:'SHADOW_MISMATCH'
  }),
  Object.freeze({
    name:'conflict route never canonicalizes',
    kind:'dispatch',
    routeKey:'purchasing',
    actual:Object.freeze({opened:true,rendererOwner:'app.js',renderer:'renderRetailPurchasing',navigationOwner:'app.js',augmentationLayers:Object.freeze([]),sourceEvidence:Object.freeze(['fixture:purchasing:app'])}),
    expected:'SHADOW_CONFLICT_BLOCKED'
  }),
  Object.freeze({
    name:'deferred route stays deferred',
    kind:'dispatch',
    routeKey:'websitePayments',
    actual:Object.freeze({opened:true,rendererOwner:'app.js',renderer:'renderWebsitePayments',navigationOwner:'websiteManagement hub',augmentationLayers:Object.freeze([]),sourceEvidence:Object.freeze(['fixture:website-payments'])}),
    expected:'SHADOW_DEFERRED'
  }),
  Object.freeze({
    name:'new target stays non canonical',
    kind:'dispatch',
    routeKey:'summary',
    actual:null,
    expected:'SHADOW_NEW_TARGET'
  }),
  Object.freeze({
    name:'unknown route',
    kind:'dispatch',
    routeKey:'__fake_unknown_route__',
    actual:Object.freeze({opened:false,sourceEvidence:Object.freeze(['fixture:unknown'])}),
    expected:'UNKNOWN'
  }),
  Object.freeze({
    name:'retail route hidden in restaurant',
    kind:'visibility',
    routeKey:'marketSettings',
    actualVisible:false,
    context:Object.freeze({profile:'restaurant'}),
    expected:'SHADOW_MATCH'
  }),
  Object.freeze({
    name:'retail route leakage in restaurant',
    kind:'visibility',
    routeKey:'marketSettings',
    actualVisible:true,
    context:Object.freeze({profile:'restaurant'}),
    expected:'SHADOW_MISMATCH'
  }),
  Object.freeze({
    name:'disabled feature hidden',
    kind:'visibility',
    routeKey:'internalSupply',
    actualVisible:false,
    context:Object.freeze({profile:'restaurant',featureAllowed:false}),
    expected:'SHADOW_MATCH'
  }),
  Object.freeze({
    name:'disabled feature leaked',
    kind:'visibility',
    routeKey:'internalSupply',
    actualVisible:true,
    context:Object.freeze({profile:'restaurant',featureAllowed:false}),
    expected:'SHADOW_MISMATCH'
  }),
  Object.freeze({
    name:'permission denied hidden',
    kind:'visibility',
    routeKey:'users',
    actualVisible:false,
    context:Object.freeze({profile:'restaurant',permissionAllowed:false}),
    expected:'SHADOW_MATCH'
  }),
  Object.freeze({
    name:'permission denied leaked',
    kind:'visibility',
    routeKey:'users',
    actualVisible:true,
    context:Object.freeze({profile:'restaurant',permissionAllowed:false}),
    expected:'SHADOW_MISMATCH'
  }),
  Object.freeze({
    name:'hr group is not route',
    kind:'descriptor',
    descriptor:Object.freeze({kind:'group',routeKey:null,navigationKey:'group:hr'}),
    expected:'GROUP_NON_ROUTE'
  }),
  Object.freeze({
    name:'branch control is action not route',
    kind:'descriptor',
    descriptor:Object.freeze({kind:'action',routeKey:null,navigationKey:'id:manageBranchesBtn'}),
    expected:'ACTION_NON_ROUTE'
  })
]);
