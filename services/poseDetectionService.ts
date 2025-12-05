import { PoseLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';

export interface PoseData {
    landmarks: NormalizedLandmark[];
    worldLandmarks: NormalizedLandmark[];
    timestamp?: number;
}

export interface MovementAnalysis {
    detectedSkill?: string;
    keyAngles: { joint: string; angle: number }[];
    poseSummary: string;
}

class PoseDetectionService {
    private imageLandmarker: PoseLandmarker | null = null;
    private videoLandmarker: PoseLandmarker | null = null;
    private initPromiseImage: Promise<void> | null = null;
    private initPromiseVideo: Promise<void> | null = null;

    // Helper to load vision tasks
    private async createVision() {
        return await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
    }

    // Helper to create options
    private createOptions(runningMode: 'IMAGE' | 'VIDEO') {
        return {
            baseOptions: {
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
                delegate: 'CPU' as const
            },
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
            runningMode: runningMode
        };
    }

    async initializeImageMode() {
        if (this.initPromiseImage) return this.initPromiseImage;

        this.initPromiseImage = (async () => {
            console.log('📷 Initializing MediaPipe Pose Landmarker (IMAGE Mode)...');
            const vision = await this.createVision();
            this.imageLandmarker = await PoseLandmarker.createFromOptions(vision, this.createOptions('IMAGE'));
            console.log('✅ MediaPipe Pose Landmarker (IMAGE Mode) initialized');
        })();

        return this.initPromiseImage;
    }

    async initializeVideoMode() {
        if (this.initPromiseVideo) return this.initPromiseVideo;

        this.initPromiseVideo = (async () => {
            console.log('🎥 Initializing MediaPipe Pose Landmarker (VIDEO Mode)...');
            const vision = await this.createVision();
            this.videoLandmarker = await PoseLandmarker.createFromOptions(vision, this.createOptions('VIDEO'));
            console.log('✅ MediaPipe Pose Landmarker (VIDEO Mode) initialized');
        })();

        return this.initPromiseVideo;
    }

    async detectPoseFromImage(imageElement: HTMLImageElement): Promise<PoseData | null> {
        if (!this.imageLandmarker) await this.initializeImageMode();

        try {
            // IMAGE mode doesn't need timestamp
            const result = this.imageLandmarker!.detect(imageElement);
            if (result.landmarks.length > 0) {
                return {
                    landmarks: result.landmarks[0] as NormalizedLandmark[],
                    worldLandmarks: result.worldLandmarks[0] as NormalizedLandmark[]
                };
            }
        } catch (error) {
            console.error('Pose detection error (Image):', error);
        }
        return null;
    }

    async detectPoseFrame(videoElement: HTMLVideoElement): Promise<PoseData | null> {
        if (!this.imageLandmarker) await this.initializeImageMode();

        try {
            // Treat video frame as an image (stateless detection)
            // This is more robust for playback loops or seeking than VIDEO mode
            const result = this.imageLandmarker!.detect(videoElement);
            if (result.landmarks.length > 0) {
                return {
                    landmarks: result.landmarks[0] as NormalizedLandmark[],
                    worldLandmarks: result.worldLandmarks[0] as NormalizedLandmark[]
                };
            }
        } catch (error) {
            console.warn('Pose detection warning (Frame/Image Mode):', error);
        }
        return null;
    }

    async detectPoseFromVideo(videoElement: HTMLVideoElement, timestamp: number): Promise<PoseData | null> {
        if (!this.videoLandmarker) await this.initializeVideoMode();

        try {
            const result = this.videoLandmarker!.detectForVideo(videoElement, timestamp);
            if (result.landmarks.length > 0) {
                return {
                    landmarks: result.landmarks[0] as NormalizedLandmark[],
                    worldLandmarks: result.worldLandmarks[0] as NormalizedLandmark[]
                };
            }
        } catch (error) {
            console.warn('Pose detection warning (Video):', error);
        }
        return null;
    }

    drawPose(ctx: CanvasRenderingContext2D, pose: PoseData) {
        const landmarks = pose.landmarks;
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;

        // Draw connections
        if (PoseLandmarker.POSE_CONNECTIONS) {
            for (const connection of PoseLandmarker.POSE_CONNECTIONS) {
                const startIdx = connection.start;
                const endIdx = connection.end;

                const startLandmark = landmarks[startIdx];
                const endLandmark = landmarks[endIdx];

                const x1 = startLandmark.x * width;
                const y1 = startLandmark.y * height;
                const x2 = endLandmark.x * width;
                const y2 = endLandmark.y * height;

                // Draw white outline/base (Thicker for better visibility)
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 8;
                ctx.stroke();

                // Draw colored inner line based on side (Left=Cyan, Right=Orange)
                // Left side indices are usually odd, Right side even (in MediaPipe Body)
                let color = '#FFFFFF';

                if (startIdx % 2 !== 0 && endIdx % 2 !== 0) {
                    color = '#00FFFF'; // Cyan
                } else if (startIdx % 2 === 0 && endIdx % 2 === 0) {
                    color = '#FFA500'; // Orange
                }

                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = color;
                ctx.lineWidth = 4;
                ctx.stroke();
            }
        }

        // Draw Landmarks (Joints)
        for (let i = 0; i < landmarks.length; i++) {
            const landmark = landmarks[i];
            const x = landmark.x * width;
            const y = landmark.y * height;

            // Inner color
            let color = '#FFFFFF';
            if (i % 2 !== 0) color = '#00FFFF'; // Cyan
            else if (i % 2 === 0) color = '#FFA500'; // Orange

            // Draw circle
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();

            // White border
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'white';
            ctx.stroke();
        }
    }

    analyzePoseGeometry(pose: PoseData): MovementAnalysis {
        const landmarks = pose.landmarks;
        const angles = this.calculateJointAngles(landmarks);
        const summary = this.generatePoseSummary(landmarks);
        return { detectedSkill: undefined, keyAngles: angles, poseSummary: summary };
    }

    private calculateJointAngles(landmarks: NormalizedLandmark[]) {
        const angles = [];

        // Right elbow
        const rightElbow = this.calculateAngle(landmarks[11], landmarks[13], landmarks[15]);
        if (!isNaN(rightElbow)) angles.push({ joint: 'Right Elbow', angle: Math.round(rightElbow) });

        // Left elbow
        const leftElbow = this.calculateAngle(landmarks[12], landmarks[14], landmarks[16]);
        if (!isNaN(leftElbow)) angles.push({ joint: 'Left Elbow', angle: Math.round(leftElbow) });

        // Right knee
        const rightKnee = this.calculateAngle(landmarks[23], landmarks[25], landmarks[27]);
        if (!isNaN(rightKnee)) angles.push({ joint: 'Right Knee', angle: Math.round(rightKnee) });

        // Left knee
        const leftKnee = this.calculateAngle(landmarks[24], landmarks[26], landmarks[28]);
        if (!isNaN(leftKnee)) angles.push({ joint: 'Left Knee', angle: Math.round(leftKnee) });

        // Right shoulder
        const rightShoulder = this.calculateAngle(landmarks[11], landmarks[13], landmarks[23]);
        if (!isNaN(rightShoulder)) angles.push({ joint: 'Right Shoulder', angle: Math.round(rightShoulder) });

        // Left shoulder  
        const leftShoulder = this.calculateAngle(landmarks[12], landmarks[14], landmarks[24]);
        if (!isNaN(leftShoulder)) angles.push({ joint: 'Left Shoulder', angle: Math.round(leftShoulder) });

        return angles;
    }

    private calculateAngle(a: NormalizedLandmark, b: NormalizedLandmark, c: NormalizedLandmark): number {
        const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
        let angle = Math.abs(radians * 180.0 / Math.PI);
        if (angle > 180.0) angle = 360.0 - angle;
        return angle;
    }

    private generatePoseSummary(landmarks: NormalizedLandmark[]): string {
        const rightWrist = landmarks[15];
        const leftWrist = landmarks[16];
        const rightShoulder = landmarks[11];
        const leftShoulder = landmarks[12];
        const rightHip = landmarks[23];
        const leftHip = landmarks[24];

        // Describe arm positions objectively
        const rightArmPosition = rightWrist.y < rightShoulder.y - 0.1 ? 'raised above shoulder' :
            rightWrist.y > rightHip.y + 0.1 ? 'lowered below hip' : 'at mid-level';
        const leftArmPosition = leftWrist.y < leftShoulder.y - 0.1 ? 'raised above shoulder' :
            leftWrist.y > leftHip.y + 0.1 ? 'lowered below hip' : 'at mid-level';

        // Body rotation estimate
        const shoulderWidth = Math.abs(landmarks[11].x - landmarks[12].x);
        const bodyAlignment = shoulderWidth > 0.25 ? 'body rotated/sideways' : 'facing camera';

        return `Right arm: ${rightArmPosition}, Left arm: ${leftArmPosition}, Body: ${bodyAlignment}`;
    }

    async drawPoseToImage(imageElement: HTMLImageElement, pose: PoseData): Promise<string> {
        const canvas = document.createElement('canvas');
        canvas.width = imageElement.naturalWidth;
        canvas.height = imageElement.naturalHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) return '';

        // Draw original image
        ctx.drawImage(imageElement, 0, 0);

        // Draw pose on top
        this.drawPose(ctx, pose);

        // Return base64
        return canvas.toDataURL('image/jpeg', 0.8);
    }
}

export const poseDetectionService = new PoseDetectionService();
