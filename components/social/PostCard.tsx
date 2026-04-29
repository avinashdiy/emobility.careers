import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ReactionBar } from "@/components/social/ReactionBar";
import { CommentSection } from "@/components/social/CommentSection";
import { PostActions } from "@/components/social/PostActions";
import { relativeTime } from "@/lib/utils";
import type { ReactionType } from "@prisma/client";
import { Briefcase, Globe, Users } from "lucide-react";

const PERSON_TYPE_LABEL: Record<string, string> = {
  PROFESSIONAL: "Professional",
  STUDENT: "Student",
  TRAINER: "Trainer",
  FACULTY: "Faculty",
  TPO: "Placement Officer",
  EXPERT: "Industry Expert",
  COMPANY_REP: "Company",
};

interface FeedAuthor {
  id: string;
  name: string | null;
  candidateProfile: {
    slug: string;
    firstName: string;
    lastName: string | null;
    headline: string | null;
    profilePhotoUrl: string | null;
    isDIYguruVerified: boolean;
    personType: string;
  } | null;
}

export interface FeedPostShape {
  id: string;
  body: string;
  hashtags: string[];
  visibility: "PUBLIC" | "CONNECTIONS" | "PRIVATE";
  createdAt: Date;
  reactionsCount: number;
  commentsCount: number;
  repostsCount: number;
  author: FeedAuthor;
  asCompany: { id: string; slug: string; name: string; logoUrl: string | null } | null;
  attachedJob: {
    id: string;
    title: string;
    locations: string[];
    workMode: string;
    profileMode: string;
    company: { name: string; slug: string; logoUrl: string | null };
  } | null;
  repostOf: {
    id: string;
    body: string;
    createdAt: Date;
    author: {
      candidateProfile: {
        slug: string;
        firstName: string;
        lastName: string | null;
        profilePhotoUrl: string | null;
      } | null;
    };
  } | null;
  reactions: { type: ReactionType; userId: string }[];
}

export function PostCard({
  post,
  viewerId,
  showComments = false,
}: {
  post: FeedPostShape;
  viewerId: string | null;
  showComments?: boolean;
}) {
  const c = post.author.candidateProfile;
  const isCompanyPost = !!post.asCompany;
  const headerName = isCompanyPost
    ? post.asCompany!.name
    : (c ? `${c.firstName} ${c.lastName ?? ""}`.trim() : (post.author.name ?? "Someone"));
  const headerSlug = isCompanyPost
    ? `/company/${post.asCompany!.slug}`
    : (c ? `/${c.slug}` : "#");
  const avatar = isCompanyPost ? post.asCompany!.logoUrl : c?.profilePhotoUrl ?? null;

  const myReaction = viewerId ? post.reactions.find((r) => r.userId === viewerId)?.type ?? null : null;

  return (
    <Card className="p-4 transition-shadow duration-150 hover:shadow-md sm:p-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href={headerSlug}>
          <Avatar src={avatar} name={headerName} size="md" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href={headerSlug} className="font-bold text-emce-text hover:underline">
              {headerName}
            </Link>
            {!isCompanyPost && c?.isDIYguruVerified && <Badge variant="verified" className="text-[10px]">⭐</Badge>}
            {!isCompanyPost && c && (
              <span className="text-hint text-emce-text-muted">·</span>
            )}
            {!isCompanyPost && c && (
              <Badge variant="outline" className="text-[10px]">
                {PERSON_TYPE_LABEL[c.personType] ?? "Professional"}
              </Badge>
            )}
          </div>
          {!isCompanyPost && c?.headline && (
            <p className="line-clamp-1 text-hint text-emce-text-sec">{c.headline}</p>
          )}
          <div className="mt-0.5 flex items-center gap-1 text-hint text-emce-text-muted">
            <span>{relativeTime(post.createdAt)}</span>
            <span>·</span>
            {post.visibility === "PUBLIC" ? (
              <Globe className="h-3 w-3" aria-label="Anyone" />
            ) : (
              <Users className="h-3 w-3" aria-label="Connections" />
            )}
          </div>
        </div>
        <PostActions postId={post.id} authorId={post.author.id} viewerId={viewerId} />
      </div>

      {/* Body */}
      <div className="mt-3 whitespace-pre-line text-body text-emce-text">
        {renderBodyWithLinks(post.body)}
      </div>

      {/* Hashtag chips */}
      {post.hashtags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {post.hashtags.map((t) => (
            <Link
              key={t}
              href={`/tag/${t}`}
              className="text-hint font-bold text-emce-dark hover:underline"
            >
              #{t}
            </Link>
          ))}
        </div>
      )}

      {/* Repost reference */}
      {post.repostOf && (
        <div className="mt-3 rounded-md border border-emce-border bg-emce-light-bg/50 p-3">
          <div className="flex items-center gap-2">
            {post.repostOf.author.candidateProfile && (
              <>
                <Avatar
                  src={post.repostOf.author.candidateProfile.profilePhotoUrl}
                  name={`${post.repostOf.author.candidateProfile.firstName} ${post.repostOf.author.candidateProfile.lastName ?? ""}`}
                  size="sm"
                />
                <Link
                  href={`/${post.repostOf.author.candidateProfile.slug}`}
                  className="font-bold text-emce-text hover:underline"
                >
                  {post.repostOf.author.candidateProfile.firstName} {post.repostOf.author.candidateProfile.lastName ?? ""}
                </Link>
              </>
            )}
            <span className="text-hint text-emce-text-muted">· {relativeTime(post.repostOf.createdAt)}</span>
          </div>
          <p className="mt-2 line-clamp-3 text-body text-emce-text-sec">{post.repostOf.body}</p>
          <Link
            href={`/posts/${post.repostOf.id}`}
            className="mt-1 inline-block text-hint font-bold text-emce-dark hover:underline"
          >
            View original →
          </Link>
        </div>
      )}

      {/* Attached job card */}
      {post.attachedJob && (
        <Link
          href={`/jobs/${post.attachedJob.id}`}
          className="mt-3 block rounded-md border border-emce-border bg-emce-light-soft p-3 hover:border-emce-mid"
        >
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 flex-shrink-0 place-items-center overflow-hidden rounded-md bg-white text-base font-extrabold text-emce-dark">
              {post.attachedJob.company.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.attachedJob.company.logoUrl} alt={post.attachedJob.company.name} className="h-full w-full object-cover" />
              ) : (
                post.attachedJob.company.name[0]?.toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-hint text-emce-mid-muted">
                <Briefcase className="h-3.5 w-3.5" /> Open role
              </div>
              <div className="font-bold text-emce-text">{post.attachedJob.title}</div>
              <div className="text-hint text-emce-text-sec">
                {post.attachedJob.company.name} · {post.attachedJob.locations[0] ?? "Remote"} · {post.attachedJob.workMode.toLowerCase()}
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* Engagement strip */}
      {(post.reactionsCount > 0 || post.commentsCount > 0 || post.repostsCount > 0) && (
        <div className="mt-3 flex items-center justify-between text-hint text-emce-text-muted">
          <div className="flex items-center gap-1">
            {post.reactionsCount > 0 && <span>{post.reactionsCount} reactions</span>}
          </div>
          <div className="flex items-center gap-3">
            {post.commentsCount > 0 && <span>{post.commentsCount} comments</span>}
            {post.repostsCount > 0 && <span>{post.repostsCount} reposts</span>}
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-emce-border pt-2">
        <ReactionBar postId={post.id} initialReaction={myReaction} count={post.reactionsCount} />
        <CommentToggleLink postId={post.id} count={post.commentsCount} />
        <RepostButton postId={post.id} />
      </div>

      {showComments && (
        <div className="mt-3 border-t border-emce-border pt-3">
          <CommentSection postId={post.id} />
        </div>
      )}
    </Card>
  );
}

function renderBodyWithLinks(body: string): React.ReactNode[] {
  // Light renderer: hashtags become links, URLs become clickable.
  const parts: React.ReactNode[] = [];
  const re = /(#[a-z0-9_-]+|https?:\/\/\S+)/gi;
  let last = 0;
  let i = 0;
  let m;
  while ((m = re.exec(body))) {
    if (m.index > last) parts.push(body.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("#")) {
      const tag = tok.slice(1).toLowerCase();
      parts.push(
        <Link key={i++} href={`/tag/${tag}`} className="font-bold text-emce-dark hover:underline">
          {tok}
        </Link>,
      );
    } else {
      parts.push(
        <a key={i++} href={tok} target="_blank" rel="noopener noreferrer" className="text-emce-dark underline">
          {tok}
        </a>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts;
}

function CommentToggleLink({ postId, count }: { postId: string; count: number }) {
  return (
    <Link
      href={`/posts/${postId}`}
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-bold text-emce-text-sec hover:bg-emce-light-soft"
    >
      <span>💬</span>
      <span>Comment{count > 0 ? ` · ${count}` : ""}</span>
    </Link>
  );
}

function RepostButton({ postId }: { postId: string }) {
  return (
    <Link
      href={`/posts/${postId}?repost=1`}
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-bold text-emce-text-sec hover:bg-emce-light-soft"
    >
      <span>🔁</span>
      <span>Repost</span>
    </Link>
  );
}
