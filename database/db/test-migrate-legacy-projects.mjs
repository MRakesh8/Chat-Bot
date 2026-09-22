import pg from "pg";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

async function run() {
  const connectionString = process.env.DATABASE_URL;
  const pool = new pg.Pool({ connectionString });
  try {
    // Begin transaction
    await pool.query("BEGIN");
    
    // Find projects with NULL organization_id
    const { rows: projects } = await pool.query(`
      SELECT p.id as project_id, p.name, p.user_id 
      FROM projects p 
      WHERE p.organization_id IS NULL
    `);
    
    if (projects.length === 0) {
      console.log("No legacy projects with NULL organization_id found.");
      await pool.query("ROLLBACK");
      return;
    }
    
    console.log(`Found ${projects.length} projects with NULL organization_id.`);
    
    let mappedCount = 0;
    let unmappedProjects = [];
    
    for (const proj of projects) {
      // Find memberships for this user
      const { rows: memberships } = await pool.query(`
        SELECT organization_id, role 
        FROM organization_members 
        WHERE user_id = $1
      `, [proj.user_id]);
      
      if (memberships.length === 1) {
        // Deterministic! Update it
        const orgId = memberships[0].organization_id;
        await pool.query(`
          UPDATE projects 
          SET organization_id = $1 
          WHERE id = $2
        `, [orgId, proj.project_id]);
        
        console.log(`Mapped project ${proj.project_id} ("${proj.name}") to org ${orgId} (owner: ${proj.user_id})`);
        mappedCount++;
      } else if (memberships.length > 1) {
        // Try to find if they are the "owner" of exactly one of them?
        const ownerMemberships = memberships.filter(m => m.role === 'owner');
        if (ownerMemberships.length === 1) {
          const orgId = ownerMemberships[0].organization_id;
          await pool.query(`
            UPDATE projects 
            SET organization_id = $1 
            WHERE id = $2
          `, [orgId, proj.project_id]);
          
          console.log(`Mapped project ${proj.project_id} ("${proj.name}") to owner org ${orgId} (owner: ${proj.user_id})`);
          mappedCount++;
        } else {
           unmappedProjects.push({ ...proj, reason: `User has ${memberships.length} memberships, ${ownerMemberships.length} owner roles.` });
        }
      } else {
        unmappedProjects.push({ ...proj, reason: "User has NO memberships." });
      }
    }
    
    // Commit the transaction
    await pool.query("COMMIT");
    console.log(`\nMigration Summary:`);
    console.log(`Successfully mapped: ${mappedCount}`);
    console.log(`Failed to map deterministically: ${unmappedProjects.length}`);
    
    if (unmappedProjects.length > 0) {
      console.log("\nUnmapped Projects:");
      unmappedProjects.forEach(p => {
        console.log(`- ID: ${p.project_id} | Name: "${p.name}" | User: ${p.user_id} | Reason: ${p.reason}`);
      });
    }
    
  } catch (err) {
    console.error("Migration failed:", err);
    await pool.query("ROLLBACK").catch(() => {});
  } finally {
    await pool.end();
  }
}
run();
