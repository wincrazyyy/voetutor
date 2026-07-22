import type { EducatorProfileDoc } from "./profile-doc";

export type UserRole = "student" | "educator" | "admin";
export type AnnouncementType = "standard" | "important" | "event";
export type TopicStatus = "locked" | "active" | "completed";
export type ForumPostType = "general" | "video_qa";
export type ClassReportStatus = "pending" | "dismissed" | "actioned";
export type VideoStatus = "uploading" | "queued" | "processing" | "ready" | "errored";
export type ReviewSource = "imported" | "verified";

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

export type EducatorTier = "basic" | "premium";

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
  /* Public-profile fields (added with the educator public-profile feature). */
  avatar_url: string | null;
  role_label: string | null;
  headline: string | null;
  hourly_rate_cents: number | null;
  subject_tags: string[] | null;
  profile_doc: EducatorProfileDoc;
  is_published: boolean;
  published_at: string | null;
  tier: EducatorTier;
  slug: string | null;
  is_verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Return shape of the public.get_public_educator_profile RPC — public-safe columns only. */
export interface PublicEducatorProfile {
  educator_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role_label: string | null;
  headline: string | null;
  hourly_rate_cents: number | null;
  subject_tags: string[] | null;
  profile_doc: EducatorProfileDoc;
  is_verified: boolean;
  tier: EducatorTier;
  published_at: string | null;
}

/** A lightweight public educator row for marketplace cards (homepage rack + /educators directory).
 *  Return shape of the public.list_published_educators RPC — public-safe columns only, no profile_doc. */
export interface PublicEducatorCard {
  educator_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role_label: string | null;
  headline: string | null;
  hourly_rate_cents: number | null;
  subject_tags: string[] | null;
  is_verified: boolean;
  tier: EducatorTier;
  published_at: string | null;
}

/** A row of the educator_reviews table (owner / admin manage view — includes hidden rows). */
export interface EducatorReview {
  id: string;
  educator_id: string;
  student_id: string | null;
  source: ReviewSource;
  rating: number;
  comment: string;
  reviewer_first_name: string | null;
  reviewer_last_name: string | null;
  reviewer_school: string | null;
  reviewer_image_url: string | null;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

/** Public RPC shape (get_public_educator_reviews) — visible reviews only, identity collapsed to a
 *  single display name. The "Imported" label is driven by source. */
export interface PublicEducatorReview {
  id: string;
  rating: number;
  comment: string;
  reviewer_name: string;
  reviewer_school: string | null;
  reviewer_image_url: string | null;
  source: ReviewSource;
  created_at: string;
}

export interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_approved: boolean;
  must_change_password: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentProfile {
  student_id: string;
  whatsapp_number: string | null;
  school: string | null;
  school_year: string | null;
  target_grade: string | null;
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
  avatar_url: string | null;
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

export type EnrollmentAccess = "full" | "scoped";

export interface ClassEnrollment {
  user_id: string;
  class_id: string;
  /** The enrollment's content perimeter: "full" (default, whole curriculum) or "scoped"
   *  (fail-closed — the student sees exactly the union of the Access Passes they hold). */
  access_scope: EnrollmentAccess;
  enrolled_at: string;
}

/** A named, reusable Access Pass — a subset of one class's curriculum that a scoped
 *  enrollment can be limited to (class_passes table). */
export interface ClassPass {
  id: string;
  class_id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** What a pass grants — polymorphic 4-way XOR: exactly one of topic_id / subtopic_id /
 *  video_id / resource_id is set (class_pass_items table). Item grants are keyed by
 *  library-item id (not placement id) so they survive placement churn. */
export interface ClassPassItem {
  id: string;
  pass_id: string;
  topic_id: string | null;
  subtopic_id: string | null;
  video_id: string | null;
  resource_id: string | null;
  created_at: string;
}

/** Which enrollment holds which pass (class_pass_holders table — immutable join row). */
export interface ClassPassHolder {
  user_id: string;
  class_id: string;
  pass_id: string;
  granted_by: string | null;
  created_at: string;
}

/** A row of the class_invites table — a single-use, per-student invite link for manual
 *  (off-platform payment) enrollment into one class. Readable only by the class educator / admin. */
export interface ClassInvite {
  id: string;
  token: string;
  class_id: string;
  /** NULL = full-access invite; set = a scoped invite granting this Access Pass on redeem. */
  pass_id: string | null;
  created_by: string | null;
  email: string | null;
  note: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  redeemed_by: string | null;
  redeemed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A row of the student_setup_tokens table — a durable one-click setup link for an
 *  educator-provisioned student account. Written/read via the service-role client only;
 *  the authenticated select policy (issuer/admin) exists for a future manage UI. */
export interface StudentSetupToken {
  id: string;
  token: string;
  user_id: string;
  class_id: string;
  created_by: string | null;
  revoked_at: string | null;
  /** Stamped by consume_own_setup_tokens once first-password setup completes — hard spent signal. */
  consumed_at: string | null;
  created_at: string;
}

export type ClassInvitePreviewReason = "revoked" | "redeemed" | "expired" | "valid";

/** Return shape of the public.get_class_invite_preview RPC — the anon-safe summary shown on the
 *  invite landing page (class title + educator name only; never email/note/created_by). */
export interface ClassInvitePreview {
  class_id: string;
  class_title: string;
  educator_name: string;
  redeemable: boolean;
  reason: ClassInvitePreviewReason;
  /** Audience label of a scoped invite (the pass name); null = full-access invite. */
  pass_name: string | null;
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
  /** Polymorphic parent: exactly one of topic_id / subtopic_id is set (XOR). */
  topic_id: string | null;
  subtopic_id: string | null;
  order_index: number;
  created_at: string;
}

/** A library note (PDF), owned by an educator and placed into the curriculum via resource_placements. */
export interface Resource {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  size_bytes: number;
  file_url: string;
  created_at: string;
  updated_at: string;
}

export interface ResourcePlacement {
  id: string;
  resource_id: string;
  /** Polymorphic parent: exactly one of topic_id / subtopic_id is set (XOR). */
  topic_id: string | null;
  subtopic_id: string | null;
  order_index: number;
  created_at: string;
}

/** A curriculum parent node — a video or note placement hangs off exactly one of these. */
export type PlacementParent =
  | { kind: "topic"; id: string }
  | { kind: "subtopic"; id: string };

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

export interface UserClassOrder {
  user_id: string;
  class_id: string;
  position: number;
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
  event_at: string | null;
  /** NULL = broadcast to the whole class; set = targeted at the holders of one Access Pass. */
  pass_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementRead {
  user_id: string;
  announcement_id: string;
  created_at: string;
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
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface ForumReply {
  id: string;
  post_id: string;
  parent_reply_id: string | null;
  author_id: string;
  content: string;
  upvotes: number;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface ForumPostUpvote {
  user_id: string;
  post_id: string;
  created_at: string;
}

export interface ForumReplyUpvote {
  user_id: string;
  reply_id: string;
  created_at: string;
}
