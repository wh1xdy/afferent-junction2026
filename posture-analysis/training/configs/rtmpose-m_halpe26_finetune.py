# Fine-tune RTMPose-m Halpe-26 (body + feet) on our own corrected frames.
#
# Inherits the official config shipped inside the mmpose 1.3.2 wheel
#   configs/body_2d_keypoint/rtmpose/body8/rtmpose-m_8xb512-700e_body8-halpe26-256x192.py
# and starts from the official checkpoint (the exact weights rtmlib's
# BodyWithFeet(mode='balanced') runs as ONNX):
#   rtmpose-m_simcc-body7_pt-body7-halpe26_700e-256x192-4d3e73dd_20230605.pth
#
# Data layout (AFFERENT_DATA_ROOT, default data/):
#   frames/<session_id>/<file>.jpg
#   annotations/{train,val,test}.json   (COCO keypoints, 26 Halpe points; split.py)
#
# Train:  python scripts/train.py configs/rtmpose-m_halpe26_finetune.py
# Small-data knobs: base_lr, max_epochs, frozen_stages (see below).
import os

_base_ = ['mmpose::body_2d_keypoint/rtmpose/body8/'
          'rtmpose-m_8xb512-700e_body8-halpe26-256x192.py']

data_root = os.environ.get('AFFERENT_DATA_ROOT', 'data/')
if not data_root.endswith('/'):
    data_root += '/'

# ---------------------------------------------------------------- checkpoint
load_from = ('https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/'
             'rtmpose-m_simcc-body7_pt-body7-halpe26_700e-256x192-4d3e73dd_20230605.pth')

# ------------------------------------------------------------------- schedule
# Official: 700 epochs, lr 4e-3, batch 8x512 on 7 public datasets.
# Fine-tune: ~10x lower LR, short schedule, batch fitting an 8 GB GPU.
num_keypoints = 26
input_size = (192, 256)  # (w, h) -- must stay = rtmlib pose_input_size
max_epochs = 60
stage2_num_epochs = 10
base_lr = 4e-4
train_batch_size = 64
val_batch_size = 64

train_cfg = dict(max_epochs=max_epochs, val_interval=5)
randomness = dict(seed=0)

optim_wrapper = dict(
    type='OptimWrapper',
    optimizer=dict(type='AdamW', lr=base_lr, weight_decay=0.05),
    clip_grad=dict(max_norm=35, norm_type=2),
    paramwise_cfg=dict(
        norm_decay_mult=0, bias_decay_mult=0, bypass_duplicate=True))
# Mixed precision on GPU: python scripts/train.py ... --amp

param_scheduler = [
    dict(type='LinearLR', start_factor=1.0e-3, by_epoch=False, begin=0,
         end=200),
    dict(type='CosineAnnealingLR', eta_min=base_lr * 0.05,
         begin=max_epochs // 2, end=max_epochs, T_max=max_epochs // 2,
         by_epoch=True, convert_to_iter_based=True),
]
auto_scale_lr = dict(base_batch_size=train_batch_size)

# --------------------------------------------------------------------- model
codec = dict(
    type='SimCCLabel', input_size=input_size, sigma=(4.9, 5.66),
    simcc_split_ratio=2.0, normalize=False, use_dark=False)

model = dict(
    backbone=dict(
        # Weights come from load_from: skip the separate backbone download.
        init_cfg=None,
        # Single-GPU / CPU friendly (mmengine also reverts SyncBN when not
        # distributed). Same parameter names -> checkpoint loads unchanged.
        norm_cfg=dict(type='BN'),
        # Very small datasets (< ~1k instances): freeze stem + first stages,
        # e.g. frozen_stages=2, to limit forgetting.
        frozen_stages=-1,
    ),
    head=dict(decoder=codec),
    test_cfg=dict(flip_test=True),
)

# ---------------------------------------------------------------------- data
dataset_type = 'CocoDataset'
data_mode = 'topdown'
backend_args = dict(backend='local')
# Halpe-26 metainfo (names, flip pairs, OKS sigmas). mmpose resolves this
# relative path inside the installed package (mmpose/.mim/configs/...).
metainfo = dict(from_file='configs/_base_/datasets/halpe26.py')

# Same augmentations as the official recipe, a bit gentler on rotation:
# home footage is mostly upright people.
train_pipeline = [
    dict(type='LoadImage', backend_args=backend_args),
    dict(type='GetBBoxCenterScale'),
    dict(type='RandomFlip', direction='horizontal'),
    dict(type='RandomHalfBody'),
    dict(type='RandomBBoxTransform', scale_factor=[0.6, 1.4],
         rotate_factor=45),
    dict(type='TopdownAffine', input_size=input_size),
    dict(type='PhotometricDistortion'),
    dict(type='Albumentation', transforms=[
        dict(type='Blur', p=0.1),
        dict(type='MedianBlur', p=0.1),
        dict(type='CoarseDropout', max_holes=1, max_height=0.4,
             max_width=0.4, min_holes=1, min_height=0.2, min_width=0.2,
             p=0.5),
    ]),
    dict(type='GenerateTarget', encoder=codec),
    dict(type='PackPoseInputs'),
]
train_pipeline_stage2 = [
    dict(type='LoadImage', backend_args=backend_args),
    dict(type='GetBBoxCenterScale'),
    dict(type='RandomFlip', direction='horizontal'),
    dict(type='RandomHalfBody'),
    dict(type='RandomBBoxTransform', shift_factor=0., scale_factor=[0.75, 1.25],
         rotate_factor=30),
    dict(type='TopdownAffine', input_size=input_size),
    dict(type='Albumentation', transforms=[
        dict(type='Blur', p=0.1),
        dict(type='MedianBlur', p=0.1),
    ]),
    dict(type='GenerateTarget', encoder=codec),
    dict(type='PackPoseInputs'),
]
val_pipeline = [
    dict(type='LoadImage', backend_args=backend_args),
    dict(type='GetBBoxCenterScale'),
    dict(type='TopdownAffine', input_size=input_size),
    dict(type='PackPoseInputs'),
]


def _ds(split, pipeline, test_mode):
    return dict(
        type=dataset_type, data_root=data_root, data_mode=data_mode,
        metainfo=metainfo, ann_file=f'annotations/{split}.json',
        data_prefix=dict(img='frames/'), pipeline=pipeline,
        test_mode=test_mode)


# NB: `_delete_=True` drops the 7 public datasets of the base config.
# To limit forgetting you can append e.g. the Halpe train set (licence:
# research only, see README) as a second entry of a CombinedDataset.
train_dataloader = dict(
    _delete_=True,
    batch_size=train_batch_size,
    num_workers=4,
    pin_memory=True,
    persistent_workers=True,
    sampler=dict(type='DefaultSampler', shuffle=True),
    dataset=_ds('train', train_pipeline, False),
)
val_dataloader = dict(
    _delete_=True,
    batch_size=val_batch_size,
    num_workers=2,
    persistent_workers=True,
    drop_last=False,
    sampler=dict(type='DefaultSampler', shuffle=False, round_up=False),
    dataset=_ds('val', val_pipeline, True),
)
test_dataloader = dict(
    _delete_=True,
    batch_size=val_batch_size,
    num_workers=2,
    persistent_workers=True,
    drop_last=False,
    sampler=dict(type='DefaultSampler', shuffle=False, round_up=False),
    dataset=_ds('test', val_pipeline, True),
)

# ----------------------------------------------------------------- evaluation
# PCKAccuracy here is bbox-normalised (mmpose default); the torso-normalised
# PCK@0.05 incl. per-foot-point breakdown is computed by scripts/evaluate.py
# on the exported ONNX, exactly as rtmlib runs it.
val_evaluator = [
    dict(type='CocoMetric', ann_file=data_root + 'annotations/val.json'),
    dict(type='PCKAccuracy', thr=0.05),
    dict(type='AUC'),
]
test_evaluator = [
    dict(type='CocoMetric', ann_file=data_root + 'annotations/test.json'),
    dict(type='PCKAccuracy', thr=0.05),
    dict(type='AUC'),
]

# --------------------------------------------------------------------- hooks
default_hooks = dict(
    checkpoint=dict(save_best='coco/AP', rule='greater', max_keep_ckpts=2,
                    interval=5),
    logger=dict(interval=20),
)
custom_hooks = [
    dict(type='EMAHook', ema_type='ExpMomentumEMA', momentum=0.0002,
         update_buffers=True, priority=49),
    dict(type='mmdet.PipelineSwitchHook',
         switch_epoch=max_epochs - stage2_num_epochs,
         switch_pipeline=train_pipeline_stage2),
]
