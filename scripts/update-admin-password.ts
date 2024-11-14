import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function updateAdminPassword() {
  const password = "Admin123!@#";
  const hashedPassword = await hashPassword(password);
  
  await db
    .update(users)
    .set({ 
      password: hashedPassword,
      isAdmin: true,
      plan: 'pro'
    })
    .where(eq(users.email, 'admin@example.com'));
    
  console.log('Admin password updated successfully');
}

updateAdminPassword().catch(console.error);
