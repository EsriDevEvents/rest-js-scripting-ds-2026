import "dotenv/config"
import chalk from "chalk"
import ora from "ora"
import { ArcGISIdentityManager } from "@esri/arcgis-rest-request"
import { searchItems } from "@esri/arcgis-rest-portal"
import { queryFeatures, updateFeatures } from "@esri/arcgis-rest-feature-service"
import { findElevationAtManyPoints } from "@esri/arcgis-rest-elevation"

// Get environment variables from the .env file. Loading this file is handled by the dotenv package
const token = process.env.ACCESS_TOKEN
const serviceName = process.env.FEATURE_SERVICE_NAME

const reporter = ora("Authenticating").start()

// Authenticate
const authentication = await ArcGISIdentityManager.fromToken({
  token,
})

reporter.succeed(`Logged in as ${authentication.username}`)

// Search for item based on its name and owner
try {
  reporter.start("Searching for feature service")
  const searchResponse = await searchItems({
    q: `title:"${serviceName}" AND owner: "${authentication.username}"`,
    authentication,
  })

  // Get the item from search response
  const item = searchResponse.results[0]

  // Ensure the item is a feature service
  if (!item || item.type !== "Feature Service") {
    reporter.fail("Item is not a feature service")
    exit(0)
  } else {
    reporter.succeed(`${serviceName} found`)
  }

  const serviceUrl = `${item.url}/0`

  // Get feature data
  const { features } = await queryFeatures({
    url: serviceUrl,
    // Optional parameter to define a where clause for the query. See https://developers.arcgis.com/arcgis-rest-js/api-reference/arcgis-rest-feature-service/IQueryFeaturesOptions/#where
    // where: "",
    authentication,
  })
  reporter.succeed(`${features.length} features found`)

  reporter.start("Formatting coordinates")
 
  // Format feature geometry as coordinate [x, y]
  const coordinates = features.map(({ geometry }) => [geometry.x, geometry.y])

  reporter.stopAndPersist({ text: "Coordinates formatted", symbol: "🌐" })

  reporter.start("Fetching elevation")

  // Find elevation using the elevation service
  const elevationServiceResponse = await findElevationAtManyPoints({
    coordinates,
    authentication,
  })

  reporter.stopAndPersist({ text: `Elevation found for ${elevationServiceResponse.result.points.length} points`, symbol: "⛰️ " });


  reporter.start(`Updating ${serviceName}`)

  // Merge feature data with the updated geometry
  const featuresWithElevation = features.map(feature => {
    const geometry = elevationServiceResponse.result.points.find(point => point.x === feature.geometry.x && point.y === feature.geometry.y);
    const attributes = { ...feature.attributes, elevation: geometry.z }
    return {...feature, attributes, geometry}
  });

  // Update the feature service
  const fsResponse = await updateFeatures({
    url: serviceUrl,
    features: featuresWithElevation,
    authentication
  })


  const updatedFeatures = fsResponse.updateResults.filter(result => result.success === true);
  reporter.stopAndPersist({ text: `${updatedFeatures.length} features updated`, symbol: "🌎" })
  console.log(chalk.green(`View in map: https://www.arcgis.com/apps/mapviewer/index.html?url=${serviceUrl}&source=sd`))

  if (fsResponse.updateResults.length !== features.length) {
    console.log(chalk.red("Some features did not update successfully:"));
    console.log(fsResponse.updateResults.filter(result => result.success === false))
  }
} catch (error) {
  reporter.fail(error.message)
}
