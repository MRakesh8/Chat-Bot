import { db } from "@workspace/db";
import { projectWidgetSettings, projectApiKeys, userApiKeys } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

async function run() {
  const token = '2ca32dba01a94b00f29c3aabe5c9e7e54213e461b4fc08482e796ccd9fc8c24b';
  
  const widget = await db.query.projectWidgetSettings.findFirst({
    where: eq(projectWidgetSettings.widgetToken, token)
  });

  console.log("\n--- Widget Settings ---");
  console.log(widget);

  if (widget) {
    const keys = await db.query.projectApiKeys.findMany({
      where: eq(projectApiKeys.projectId, widget.projectId)
    });
    console.log("\n--- Project Keys ---");
    console.log(keys);
  }

  const systemKeys = await db.query.userApiKeys.findMany({
    where: eq(userApiKeys.isSystem, true)
  });
  console.log("\n--- System Keys ---");
  console.log(systemKeys);
}

run().catch(console.error);
