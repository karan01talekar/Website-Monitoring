import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
    {
        status: { type: String, enum: ["up", "down"], required: true },
        previousStatus: {
            type: String,
            enum: ["up", "down", null],
            default: null,
        },
        checkedAt: { type: Date, required: true },
        downDurationSeconds: Number,
        message: String,
    },
    { timestamps: true },
);

const monitorSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        address: { type: String, required: true, maxlength: 2048 },
        addressHash: {
            type: String,
            required: true,
            index: true,
        },
        host: { type: String, required: true },
        notificationEmail: { type: String, required: true },
        checkIntervalMinutes: { type: Number, enum: [1, 2, 5, 15], default: 1 },
        isActive: { type: Boolean, default: true },
        currentStatus: {
            type: String,
            enum: ["up", "down", null],
            default: null,
        },
        lastCheckedAt: Date,
        lastStatusChangedAt: Date,
        lastDownAt: Date,
        lastDownDurationSeconds: Number,
        downAlertSentAt: Date,
        downtimeCount: { type: Number, default: 0 },
        events: { type: [eventSchema], default: [] },
    },
    { timestamps: true },
);

monitorSchema.index({ userId: 1, addressHash: 1 }, { unique: true });

export const Monitor = mongoose.model("Monitor", monitorSchema);
