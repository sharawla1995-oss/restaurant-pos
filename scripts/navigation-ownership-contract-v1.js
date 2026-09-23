'use strict';

// Physical/source ownership expectations for Batch 1C.
// This is evidence/enforcement only; it does not select or change runtime owners.
module.exports=Object.freeze({
  version:'1.0.0-1c',
  policies:Object.freeze({
    orders:Object.freeze({
      case:'LOCKED',
      rendererOwners:Object.freeze(['app.js']),
      navigationOwners:Object.freeze(['app.js']),
      augmentationLayers:Object.freeze([])
    }),
    suppliers:Object.freeze({
      case:'CONFLICT',
      rendererOwners:Object.freeze(['app.js','beta55-restaurant-closure-ui.js']),
      navigationOwners:Object.freeze(['beta55-restaurant-closure-ui.js']),
      augmentationLayers:Object.freeze([])
    }),
    purchasing:Object.freeze({
      case:'CONFLICT',
      rendererOwners:Object.freeze(['app.js','beta55-restaurant-closure-ui.js']),
      navigationOwners:Object.freeze(['beta55-restaurant-closure-ui.js']),
      augmentationLayers:Object.freeze(['advanced-purchasing-v1.js','beta55-ui-workflow-fixes.js'])
    }),
    stockCount:Object.freeze({
      case:'CONFLICT',
      rendererOwners:Object.freeze(['app.js','beta55-restaurant-closure-ui.js']),
      navigationOwners:Object.freeze(['beta55-restaurant-closure-ui.js']),
      augmentationLayers:Object.freeze([])
    }),
    transfers:Object.freeze({
      case:'CONFLICT',
      rendererOwners:Object.freeze(['app.js','beta55-restaurant-closure-ui.js']),
      navigationOwners:Object.freeze(['beta55-restaurant-closure-ui.js']),
      augmentationLayers:Object.freeze([])
    }),
    internalSupply:Object.freeze({
      case:'AUGMENTED',
      rendererOwners:Object.freeze(['beta55-central-warehouse-ui.js']),
      navigationOwners:Object.freeze(['beta55-central-warehouse-ui.js']),
      augmentationLayers:Object.freeze(['beta55-central-warehouse-v2.js'])
    }),
    users:Object.freeze({
      case:'AUGMENTED',
      rendererOwners:Object.freeze(['app.js']),
      navigationOwners:Object.freeze(['app.js']),
      augmentationLayers:Object.freeze(['permissions-v2-ui.js'])
    }),
    websitePayments:Object.freeze({
      case:'DEFERRED',
      rendererOwners:Object.freeze(['app.js']),
      navigationOwners:Object.freeze(['websiteManagement hub']),
      augmentationLayers:Object.freeze([])
    })
  }),
  requiredCases:Object.freeze(['SINGLE','AUGMENTED','CONFLICT','DEFERRED','LOCKED'])
});
