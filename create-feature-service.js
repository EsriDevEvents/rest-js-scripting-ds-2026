import "dotenv/config";
import chalk from "chalk";
import ora from "ora";
import { ArcGISIdentityManager } from "@esri/arcgis-rest-request";
import { createFeatureService, addToServiceDefinition } from "@esri/arcgis-rest-feature-service";
import { searchItems, removeItem, getSelf } from "@esri/arcgis-rest-portal";

// Get environment variables from the .env file. Loading this file is handled by the dotenv package
const token = process.env.ACCESS_TOKEN
const serviceName = process.env.FEATURE_SERVICE_NAME

const reporter = ora();

if(!token) {
  throw new Error(
    chalk.red.bold("A token is required. Go to https://location.arcgis.com/dashboard/ to view and manage your developer credentials.")
  )
}

// Instantiate ArcGIS REST JS IdentityManager with token
const getIdentity = async () => {
  return await ArcGISIdentityManager.fromToken({ 
    token
  })
}

// Check for an existing item and delete if it exists. Allows re-running this demo continuously without additional cleanup 
const removeItems = async (authentication) => {
  reporter.start("Checking for existing items");

  const existingItems = await searchItems({
    q: `title:${serviceName} AND owner:"${authentication.username}"`,
    authentication,
  })

  if (existingItems.results.length > 0) {
    reporter.succeed(`${existingItems.results.length} item(s) found`)
    await Promise.all([
      existingItems.results.map(({ id, title, type }) => {
        reporter.start(`Deleting ${type} ${id} with title ${title}`)
        // console.log(`\nDeleting ${type} ${id} with title ${title}`)
        return removeItem({ id, authentication })
      }),
    ])

    // wait to allow time for the items to be deleted
    await new Promise(r => setTimeout(r, 2000));

    reporter.succeed(chalk.red(`Deleted ${existingItems.results.length} existing items`));
  } else {
    reporter.warn(chalk.yellow("No existing items found"));
  }
}

const createNewService = async () => {
  reporter.start("Authenticating");


  const auth = await getIdentity()
  reporter.succeed(`Logged in as ${auth.username}`);
  await removeItems(auth)

  const portalSelf = await getSelf({ authentication: auth })

  // define layer schema
  // https://developers.arcgis.com/rest/services-reference/enterprise/add-to-definition-feature-service/#example-usage

    const layerSchema = [
      {
        name: `${serviceName}_layer`,
        type: "Feature Layer",
        defaultVisibility: true,
        isDataVersioned: false,
        supportsRollbackOnFailureParameter: true,
        supportsAdvancedQueries: false,
        geometryType: "esriGeometryPoint",
        minScale: 0,
        maxScale: 0,
        extent: {
          spatialReference: {
            wkid: 4326,
          },
          xmin: -118.84764718980026,
          ymin: 33.99799168307417,
          xmax: -118.7618165013238,
          ymax: 34.026450333167524,
        },
        drawingInfo: {
          transparency: 0,
          labelingInfo: null,
          renderer: {
            type: "simple",
            symbol: {
              color: [20, 158, 206, 130],
              size: 18,
              angle: 0,
              xoffset: 0,
              yoffset: 0,
              type: "esriSMS",
              style: "esriSMSCircle",
              outline: {
                color: [255, 255, 255, 220],
                width: 2.25,
                type: "esriSLS",
                style: "esriSLSSolid",
              },
            },
          },
        },
        allowGeometryUpdates: true,
        hasAttachments: true,
        htmlPopupType: "esriServerHTMLPopupTypeNone",
        hasM: false,
        hasZ: false,
        objectIdField: "OBJECTID",
        fields: [
          {
            name: "OBJECTID",
            type: "esriFieldTypeOID",
            alias: "OBJECTID",
            sqlType: "sqlTypeOther",
            nullable: false,
            editable: false,
            domain: null,
            defaultValue: null,
          },
          {
            name: "id",
            type: "esriFieldTypeInteger",
            alias: "id",
            sqlType: "sqlTypeInteger",
            nullable: true,
            editable: true,
            domain: null,
            defaultValue: null,
          },
          {
            name: "name",
            type: "esriFieldTypeString",
            alias: "name",
            sqlType: "sqlTypeNVarchar",
            nullable: true,
            editable: true,
            domain: null,
            defaultValue: null,
            length: 256,
          },
          {
            name: "rating",
            type: "esriFieldTypeString",
            alias: "rating",
            sqlType: "sqlTypeNVarchar",
            nullable: true,
            editable: true,
            domain: null,
            defaultValue: null,
            length: 256,
          },
          {
            name: "elevation",
            type: "esriFieldTypeInteger",
            alias: "elevation",
            sqlType: "sqlTypeInteger",
            nullable: true,
            editable: true,
            domain: null,
            defaultValue: null,
          },
        ],
        templates: [
          {
            name: "New Feature",
            description: "",
            drawingTool: "esriFeatureEditToolPoint",
            prototype: {
              attributes: {
                id: null,
                name: null,
                rating: null,
              },
            },
          },
        ],
        supportedQueryFormats: "JSON",
        hasStaticData: true,
        maxRecordCount: 10000,
        capabilities: "Query,Extract",
      },
    ]

    reporter.start(chalk.blue("Creating new feature service"));

    try {
      const newService = await createFeatureService({
        authentication: auth,
        item: {
          name: serviceName,
          capabilities: "Query, Extract",
          description: "Programatically generated feature service with ArcGIS REST JS for Esri Dev & Tech Summit 2026",
          units: "esriMeters",
          initialExtent: {
            xmin: -134.74729261792592,
            ymin: 23.56096242376989,
            xmax: -55.695547615409396,
            ymax: 50.309217030288835,
            spatialReference: { wkid: 4326 },
          },
          spatialReference: { wkid: 4326 },
        },
      })
      reporter.succeed(`Feature service ${newService.itemId} created`)

      reporter.start(`Adding schema`);

      // create layer
      const newFeatureLayer = await addToServiceDefinition(newService.serviceurl, {
        authentication: auth,
        layers: layerSchema,
      })
      reporter.succeed(`Added ${newFeatureLayer.layers[0].name} to feature service`)

      console.log(
        chalk.green.bold("\nView feature service:\n"),
        chalk.green(`https://${portalSelf.urlKey}.maps.arcgis.com/home/item.html?id=${newService.itemId}`)
      )
    } catch (error) {
      reporter.fail(error.message);
    }
}

createNewService();
