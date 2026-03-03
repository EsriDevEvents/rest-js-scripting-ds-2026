import "dotenv/config"
import chalk from "chalk"
import ora from "ora"
import { ArcGISIdentityManager } from "@esri/arcgis-rest-request"
import { addFeatures, deleteFeatures } from "@esri/arcgis-rest-feature-service"
import { getItemData, getItem, searchItems } from "@esri/arcgis-rest-portal"

// Get environment variables from the .env file. Loading this file is handled by the dotenv package
const token = process.env.ACCESS_TOKEN
const serviceName = process.env.FEATURE_SERVICE_NAME

const reporter = ora("Authenticating").start()

/**
 * Generating random feature data
 */

// Used for generating a random lat/lng (https://stackoverflow.com/a/6878845)
const getRandomInRange = (from, to, fixed) => {
  return (Math.random() * (to - from) + from).toFixed(fixed) * 1
}

const getRandomRating = () => {
  const ratings = ["Great", "Awesome", "Excellent", "Unbelieveable", "Wow", "Cowabunga"]
  return ratings[Math.floor]
}

const generateFeatures = count => {
  const features = []
  for (let i = 0; i < count; i++) {
    features.push({
      attributes: {
        id: i,
        name: `New feature #${i + 1}`,
        rating: getRandomRating(),
      },
      geometry: {
        x: getRandomInRange(-116.57, -116.5, 3),
        y: getRandomInRange(33.8, 33.84, 3),
        spatialReference: { wkid: 4326 },
      },
    })
  }
  return features
}

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
  reporter.start("Verifying item type")

  // Ensure the item is a feature service
  if (!item || item.type !== "Feature Service") {
    reporter.fail("Item is not a feature service")
    exit(0)
  } else {
    reporter.succeed(`${serviceName} found`)
  }

  const serviceUrl = `${item.url}/0`

  reporter.start("Deleting old features")
  // Delete any existing features from the feature service
  const delResponse = await deleteFeatures({
    url: serviceUrl,
    where: "1=1",
    authentication,
  })
  reporter.succeed(`Feature service updated. ${delResponse.deleteResults.length} features removed`)

  reporter.start("Generating new feature data")

  const features = generateFeatures(100)

  // Send the new features to the service
  const addResponse = await addFeatures({
    url: serviceUrl,
    features,
    authentication,
  })
  reporter.succeed(`${addResponse.addResults.length} new features added`)
  console.log(chalk.green(`View in map: https://www.arcgis.com/apps/mapviewer/index.html?url=${serviceUrl}&source=sd`))
} catch (error){
  reporter.fail(error.message)
}
