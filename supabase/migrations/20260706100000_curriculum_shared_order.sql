/* Curriculum shared order: collapse video_placements.order_index and resource_placements.order_index
   from two independent per-node sequences into ONE shared 0..n sequence per node, so videos and notes
   can interleave freely. Videos come first, then notes, preserving each kind's existing relative order.

   Idempotent: this is a full deterministic renumber (not a shift), so re-running yields the same result.
   A node is a distinct (topic_id, subtopic_id) pair — exactly one column is non-null (chk_*_placement_parent),
   so partitioning by both columns partitions by the node. Data migration only; not part of the declarative
   schema. No forum-lineage change (order_index is not the topic_id/subtopic_id), so the placement guards
   early-exit. */

UPDATE public.video_placements vp
SET order_index = ranked.new_index
FROM (
    SELECT
        id,
        (row_number() OVER (
            PARTITION BY topic_id, subtopic_id
            ORDER BY order_index, created_at
        ) - 1) AS new_index
    FROM public.video_placements
) AS ranked
WHERE vp.id = ranked.id
    AND vp.order_index <> ranked.new_index;

UPDATE public.resource_placements rp
SET order_index = ranked.new_index
FROM (
    SELECT
        rp2.id,
        (COALESCE(vc.video_count, 0) + row_number() OVER (
            PARTITION BY rp2.topic_id, rp2.subtopic_id
            ORDER BY rp2.order_index, rp2.created_at
        ) - 1) AS new_index
    FROM public.resource_placements rp2
    LEFT JOIN (
        SELECT topic_id, subtopic_id, count(*) AS video_count
        FROM public.video_placements
        GROUP BY topic_id, subtopic_id
    ) AS vc
        ON vc.topic_id IS NOT DISTINCT FROM rp2.topic_id
        AND vc.subtopic_id IS NOT DISTINCT FROM rp2.subtopic_id
) AS ranked
WHERE rp.id = ranked.id
    AND rp.order_index <> ranked.new_index;
