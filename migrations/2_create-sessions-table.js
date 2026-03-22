/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
export const up = (pgm) => {
  pgm.createTable("sessions", {
    // SHA-256 hash of the raw session token stored in the cookie
    id: {
      type: "text",
      primaryKey: true,
    },
    user_id: {
      type: "uuid",
      notNull: true,
      references: "users(id)",
      onDelete: "CASCADE",
    },
    expires_at: {
      type: "timestamptz",
      notNull: true,
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  });

  pgm.createIndex("sessions", "user_id");
  // Index expires_at for efficient cleanup queries
  pgm.createIndex("sessions", "expires_at");
};

/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
export const down = (pgm) => {
  pgm.dropTable("sessions");
};
