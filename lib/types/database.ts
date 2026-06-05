export type UserRole = "student" | "educator" | "admin";
export type AnnouncementType = "standard" | "important" | "event";
export type TopicStatus = "locked" | "active" | "completed";
export type ForumPostType = "general" | "video_qa";
export type ClassReportStatus = "pending" | "dismissed" | "actioned";
export type VideoStatus = "uploading" | "queued" | "processing" | "ready" | "errored";

export interface ClassReport {
  id: string;
  class_id: string;
  reporter_id: string;
  reason: string;
  status: ClassReportStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EducatorProfile {
  educator_id: string;
  gender: string | null;
  whatsapp_number: string | null;
  education: string | null;
  education_degree: string | null;
  education_major: string | null;
  graduation_year: number | null;
  teaching_experience: string | null;
  teaching_subjects: string | null;
  self_introduction: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  role: UserRole;
  is_approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfilePublic {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  role: UserRole;
  is_approved: boolean;
}

export interface Class {
  id: string;
  code: string;
  title: string;
  description: string | null;
  educator_id: string | null;
  price_cents: number;
  currency: string;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClassEnrollment {
  user_id: string;
  class_id: string;
  enrolled_at: string;
}

export interface Topic {
  id: string;
  class_id: string;
  title: string;
  total_duration: string | null;
  status: TopicStatus;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface Subtopic {
  id: string;
  topic_id: string;
  title: string;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface Video {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  duration: string | null;
  video_url: string | null;
  cloudflare_uid: string | null;
  status: VideoStatus;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface VideoPlacement {
  id: string;
  video_id: string;
  subtopic_id: string;
  order_index: number;
  created_at: string;
}

export interface Resource {
  id: string;
  title: string;
  size_bytes: number;
  file_url: string;
  topic_id: string | null;
  subtopic_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserVideoProgress {
  user_id: string;
  video_id: string;
  last_position: string;
  total_watch_time: string;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Announcement {
  id: string;
  class_id: string;
  author_id: string;
  title: string;
  content: string;
  type: AnnouncementType;
  link_title: string | null;
  link_url: string | null;
  image_alt: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ForumPost {
  id: string;
  class_id: string;
  author_id: string;
  type: ForumPostType;
  video_id: string | null;
  title: string;
  content: string;
  upvotes: number;
  is_resolved: boolean;
  created_at: string;
  updated_at: string;
}

export interface ForumReply {
  id: string;
  post_id: string;
  parent_reply_id: string | null;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface ForumPostUpvote {
  user_id: string;
  post_id: string;
  created_at: string;
}
