import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ReactionBar } from "@/components/social/ReactionBar";
import { CommentSection } from "@/components/social/CommentSection";
import { PostActions } from "@/components/social/PostActions";
import { PollCard } from "@/components/social/PollCard";
import { iframeFor } from "@/lib/social/embeds";
import { relativeTime } from "@/lib/utils";
import type { EmbedProvider, PostAttachmentType, PostKind, ReactionType } from "@prisma/client";
import { Briefcase, ExternalLink, FileText, Globe, Users } from "lucide-react";

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

  // ─── Rich content fields ───
  kind?: PostKind;
  articleTitle?: string | null;
  articleCoverUrl?: string | null;
  embedUrl?: string | null;
  embedProvider?: EmbedProvider | null;
  embedTitle?: string | null;
  embedThumbnailUrl?: string | null;
  attachments?: {
    id: string;
    type: PostAttachmentType;
    url: string;
    fileName: string;
    mime: string;
    byteSize: number;
    order: number;
  }[];
  poll?: {
    id: string;
    question: string;
    closesAt: Date | string;
    multipleChoice: boolean;
    totalVotes: number;
    options: { id: string; text: string; votes: number; order: number }[];
  } | null;
  /** Option ids the viewer has already voted on, hydrated by the page. */
  viewerPollVotes?: string[];
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
    <Card className="p-3 transition-shadow duration-150 hover:shadow-md sm:p-4">
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

      {/* Article header — banner-style cover above body */}
      {post.kind === "ARTICLE" && post.articleCoverUrl && (
        <Link href={`/posts/${post.id}`} className="mt-3 block overflow-hidden rounded-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.articleCoverUrl}
            alt={post.articleTitle ?? "Article cover"}
            className="h-48 w-full object-cover sm:h-56"
          />
        </Link>
      )}
      {post.kind === "ARTICLE" && post.articleTitle && (
        <Link href={`/posts/${post.id}`} className="mt-3 block">
          <h2 className="text-section text-emce-text hover:underline">{post.articleTitle}</h2>
        </Link>
      )}

      {/* Body */}
      <div className="mt-3 whitespace-pre-line text-body text-emce-text">
        {renderBodyWithLinks(post.body)}
      </div>

      {/* Image attachments — 1 / 2 / 3 / 4+ layouts */}
      {post.attachments && post.attachments.filter((a) => a.type === "IMAGE").length > 0 && (
        <ImageAttachmentGrid
          images={post.attachments.filter((a) => a.type === "IMAGE")}
          postId={post.id}
        />
      )}

      {/* Video attachments */}
      {post.attachments?.filter((a) => a.type === "VIDEO").map((v) => (
        <div key={v.id} className="mt-3 overflow-hidden rounded-md bg-black">
          <video
            controls
            preload="metadata"
            src={v.url}
            className="h-auto max-h-[480px] w-full"
          />
        </div>
      ))}

      {/* Document attachments */}
      {post.attachments?.filter((a) => a.type === "DOCUMENT").map((d) => (
        <a
          key={d.id}
          href={d.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center gap-3 rounded-md border border-emce-border bg-emce-light-soft/50 p-3 hover:border-emce-mid hover:bg-emce-light-soft"
        >
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-md bg-emce-dark text-white">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 text-sm font-bold text-emce-text">{d.fileName}</p>
            <p className="text-hint text-emce-text-sec">
              {formatFileSize(d.byteSize)} · {extLabel(d.mime, d.fileName)}
            </p>
          </div>
          <ExternalLink className="h-4 w-4 text-emce-text-sec" />
        </a>
      ))}

      {/* Embed (YouTube / Vimeo iframe; others as link card) */}
      {post.kind === "EMBED" && post.embedUrl && post.embedProvider && (
        <EmbedRenderer
          url={post.embedUrl}
          provider={post.embedProvider}
          title={post.embedTitle ?? null}
          thumbnailUrl={post.embedThumbnailUrl ?? null}
        />
      )}

      {/* Poll */}
      {post.kind === "POLL" && post.poll && (
        <PollCard
          poll={post.poll}
          viewerVotes={post.viewerPollVotes ?? []}
          isAuthor={viewerId === post.author.id}
        />
      )}

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extLabel(mime: string, fileName: string): string {
  if (mime.includes("pdf")) return "PDF";
  if (mime.includes("word")) return "DOCX";
  if (mime.includes("powerpoint") || mime.includes("presentation")) return "PPTX";
  const ext = fileName.split(".").pop()?.toUpperCase();
  return ext ?? "FILE";
}

interface ImageAttachment {
  id: string;
  url: string;
  fileName: string;
}

function ImageAttachmentGrid({ images, postId }: { images: ImageAttachment[]; postId: string }) {
  const count = images.length;
  // LinkedIn-style layouts: 1 = full width, 2 = side-by-side, 3 = one big +
  // two stacked, 4+ = 2×2 with "+N more" overlay on the last tile.
  const visible = images.slice(0, 4);
  const overflow = Math.max(0, count - 4);

  if (count === 1) {
    return (
      <Link href={`/posts/${postId}`} className="mt-3 block overflow-hidden rounded-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[0].url}
          alt={images[0].fileName}
          className="h-auto max-h-[560px] w-full object-cover"
        />
      </Link>
    );
  }

  if (count === 2) {
    return (
      <div className="mt-3 grid grid-cols-2 gap-0.5 overflow-hidden rounded-md">
        {visible.map((img) => (
          <Link key={img.id} href={`/posts/${postId}`} className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={img.fileName} className="h-64 w-full object-cover" />
          </Link>
        ))}
      </div>
    );
  }

  if (count === 3) {
    return (
      <div className="mt-3 grid grid-cols-2 gap-0.5 overflow-hidden rounded-md">
        <Link href={`/posts/${postId}`} className="row-span-2 block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={visible[0].url} alt={visible[0].fileName} className="h-full max-h-[400px] w-full object-cover" />
        </Link>
        <Link href={`/posts/${postId}`} className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={visible[1].url} alt={visible[1].fileName} className="h-[200px] w-full object-cover" />
        </Link>
        <Link href={`/posts/${postId}`} className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={visible[2].url} alt={visible[2].fileName} className="h-[200px] w-full object-cover" />
        </Link>
      </div>
    );
  }

  // 4 or more
  return (
    <div className="mt-3 grid grid-cols-2 gap-0.5 overflow-hidden rounded-md">
      {visible.map((img, i) => (
        <Link key={img.id} href={`/posts/${postId}`} className="relative block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.url} alt={img.fileName} className="h-[200px] w-full object-cover" />
          {i === 3 && overflow > 0 && (
            <div className="absolute inset-0 grid place-items-center bg-black/55 text-2xl font-bold text-white">
              +{overflow}
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}

const PROVIDER_LABEL: Record<EmbedProvider, string> = {
  YOUTUBE: "YouTube",
  VIMEO: "Vimeo",
  INSTAGRAM: "Instagram",
  LINKEDIN: "LinkedIn",
  TWITTER: "X (Twitter)",
};

function EmbedRenderer({
  url,
  provider,
  title,
  thumbnailUrl,
}: {
  url: string;
  provider: EmbedProvider;
  title: string | null;
  thumbnailUrl: string | null;
}) {
  const embed = iframeFor({ provider, url, iframe: true, videoId: extractVideoId(url, provider) });
  // YouTube + Vimeo: render the iframe inline.
  if (embed) {
    return (
      <div className="mt-3 aspect-video w-full overflow-hidden rounded-md bg-black">
        <iframe
          src={embed}
          title={title ?? PROVIDER_LABEL[provider]}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>
    );
  }
  // Instagram / LinkedIn / X — link card with provider chip.
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 flex items-center gap-3 rounded-md border border-emce-border bg-white p-3 hover:border-emce-mid"
    >
      {thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailUrl}
          alt={title ?? PROVIDER_LABEL[provider]}
          className="h-16 w-24 flex-shrink-0 rounded object-cover"
        />
      ) : (
        <div className="grid h-16 w-24 flex-shrink-0 place-items-center rounded bg-emce-light-soft text-xs font-bold text-emce-dark">
          {PROVIDER_LABEL[provider]}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-hint font-bold uppercase tracking-wide text-emce-text-sec">
          {PROVIDER_LABEL[provider]}
        </p>
        <p className="line-clamp-2 text-sm font-bold text-emce-text">
          {title ?? url.replace(/^https?:\/\//, "")}
        </p>
        <p className="line-clamp-1 text-hint text-emce-text-sec">View on {PROVIDER_LABEL[provider]} →</p>
      </div>
    </a>
  );
}

function extractVideoId(url: string, provider: EmbedProvider): string | undefined {
  if (provider === "YOUTUBE") {
    const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/);
    return m?.[1];
  }
  if (provider === "VIMEO") {
    const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    return m?.[1];
  }
  return undefined;
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
